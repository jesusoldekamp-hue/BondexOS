/**
 * seedAuth.ts
 * ─────────────────────────────────────────────────────────────
 * Crea un usuario en Supabase Auth y lo vincula al registro
 * correspondiente en public.usuario.
 *
 * Uso:
 *   npx tsx apps/api/src/scripts/seedAuth.ts
 *
 * Variables de entorno necesarias (en .env en la raíz o en apps/api):
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=service_role_key
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";

// ── helpers ──────────────────────────────────────────────────

function ask(prompt: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      // Oculta la contraseña en la terminal
      process.stdout.write(prompt);
      process.stdin.setRawMode(true);
      let input = "";
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (char: string) => {
        if (char === "\n" || char === "\r" || char === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          rl.close();
          resolve(input);
        } else if (char === "\u007f") {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(prompt + "*".repeat(input.length));
          }
        } else {
          input += char;
          process.stdout.write("*");
        }
      });
    } else {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

// ── main ─────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "\n❌  Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.\n" +
        "    Crea un archivo .env en la raíz del proyecto con esas variables y vuelve a correr el script.\n"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("\n🔐  BondexOS — Crear usuario de acceso\n");

  // 1. Listar correos disponibles en public.usuario (sin auth_user_id)
  const { data: usuarios, error: listErr } = await supabase
    .from("usuario")
    .select("id, email, rol, nombre, tenant_id, auth_user_id")
    .order("email");

  if (listErr) {
    console.error("❌  No se pudo listar public.usuario:", listErr.message);
    process.exit(1);
  }

  const sinAuth = usuarios?.filter((u) => !u.auth_user_id) ?? [];
  const conAuth = usuarios?.filter((u) => !!u.auth_user_id) ?? [];

  if (usuarios && usuarios.length > 0) {
    console.log("Usuarios registrados en la base de datos:\n");
    console.log("  Sin cuenta de acceso (sin auth_user_id):");
    if (sinAuth.length === 0) {
      console.log("    (ninguno)");
    } else {
      sinAuth.forEach((u) => console.log(`    • ${u.email}  [${u.rol}]`));
    }
    console.log("\n  Ya con cuenta de acceso:");
    if (conAuth.length === 0) {
      console.log("    (ninguno)");
    } else {
      conAuth.forEach((u) => console.log(`    • ${u.email}  [${u.rol}]`));
    }
    console.log();
  }

  // 2. Pedir correo y contraseña
  const email = await ask("Correo a usar para iniciar sesión: ");
  if (!email || !email.includes("@")) {
    console.error("❌  Correo inválido.");
    process.exit(1);
  }

  const password = await ask("Contraseña (mín. 8 caracteres): ", true);
  if (!password || password.length < 8) {
    console.error("❌  La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  // 3. Crear usuario en Supabase Auth (Admin API)
  console.log("\n⏳  Creando usuario en Supabase Auth…");
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // confirmar correo automáticamente
  });

  if (authErr) {
    // Si ya existe el usuario en auth, intentamos obtenerlo
    if (authErr.message.toLowerCase().includes("already registered") || authErr.code === "email_exists") {
      console.log("   ℹ️  Ya existe un usuario en Auth con ese correo.");
      // Listar usuarios y buscar el existente
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find((u) => u.email === email);
      if (!existing) {
        console.error("❌  No se pudo recuperar el usuario existente.");
        process.exit(1);
      }
      // Actualizar su contraseña
      const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, { password });
      if (updErr) {
        console.error("❌  Error actualizando contraseña:", updErr.message);
        process.exit(1);
      }
      console.log("✅  Contraseña actualizada.");
      // Vincular si no está vinculado
      await linkAuthUser(supabase, email, existing.id);
      printSummary(email, password, supabaseUrl);
      process.exit(0);
    }
    console.error("❌  Error creando usuario en Auth:", authErr.message);
    process.exit(1);
  }

  const authUserId = authData.user?.id;
  if (!authUserId) {
    console.error("❌  No se recibió un ID de usuario de Auth.");
    process.exit(1);
  }

  console.log(`✅  Usuario creado en Auth (id: ${authUserId})`);

  // 4. Vincular auth_user_id en public.usuario
  await linkAuthUser(supabase, email, authUserId);

  printSummary(email, password, supabaseUrl);
}

async function linkAuthUser(
  supabase: ReturnType<typeof createClient>,
  email: string,
  authUserId: string
) {
  const { data, error } = await supabase
    .from("usuario")
    .update({ auth_user_id: authUserId })
    .eq("email", email)
    .select("id, rol, nombre");

  if (error) {
    console.warn(
      `⚠️  No se pudo vincular en public.usuario (${error.message}).\n` +
        `   Puede que el correo no exista aún en esa tabla o ya esté vinculado.\n` +
        `   Si es un correo nuevo (no está en el seed), el usuario funcionará igualmente para Auth.`
    );
    return;
  }

  if (!data || data.length === 0) {
    console.warn(
      `⚠️  No se encontró "${email}" en public.usuario.\n` +
        `   El usuario puede iniciar sesión en Auth, pero no tendrá rol en BondexOS.\n` +
        `   Inserta el registro manualmente en la tabla "usuario" si es necesario.`
    );
    return;
  }

  const u = data[0];
  console.log(`✅  Vinculado en public.usuario → rol: ${u.rol}  nombre: ${u.nombre}`);
}

function printSummary(email: string, password: string, supabaseUrl: string) {
  console.log("\n─────────────────────────────────────────");
  console.log("🎉  Listo. Usa estos datos para iniciar sesión:\n");
  console.log(`   URL:         http://localhost:3001/login`);
  console.log(`   Correo:      ${email}`);
  console.log(`   Contraseña:  ${password}`);
  console.log(`   Supabase:    ${supabaseUrl}`);
  console.log("─────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("❌  Error inesperado:", err);
  process.exit(1);
});
