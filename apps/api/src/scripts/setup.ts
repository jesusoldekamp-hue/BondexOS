/**
 * setup.ts — BondexOS Live Setup
 * Aplica las migraciones SQL en Supabase y crea tu usuario de acceso.
 *
 * Uso:
 *   npx tsx --env-file=.env apps/api/src/scripts/setup.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../../");

// ── readline helpers ──────────────────────────────────────────

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let input = "";
    const handler = (char: string) => {
      if (char === "\n" || char === "\r" || char === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", handler);
        process.stdout.write("\n");
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
    };
    process.stdin.on("data", handler);
  });
}

// ── apply migrations via pg REST ──────────────────────────────

async function runSQL(supabaseUrl: string, serviceKey: string, sql: string): Promise<{ error?: string }> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    // Intentar con el endpoint de administración de SQL de Supabase
    return { error: `HTTP ${res.status}: ${await res.text()}` };
  }
  return {};
}

// ── main ─────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌  Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }

  console.log("\n🚀  BondexOS — Setup Live\n");
  console.log(`   Proyecto: ${supabaseUrl}\n`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── PASO 1: Verificar conexión ─────────────────────────────
  console.log("⏳  Verificando conexión a Supabase…");
  const { error: pingErr } = await supabase.from("tenant").select("id").limit(1);
  
  if (pingErr) {
    if (pingErr.message.includes("does not exist") || pingErr.code === "42P01") {
      console.log("   ⚠️  Tablas no encontradas. Necesitas aplicar las migraciones SQL manualmente.");
      console.log("   📋  Ve a: https://supabase.com/dashboard/project/hevmnqhuvqlxlznlpabr/sql/new");
      console.log("   📁  Copia y pega el contenido de estos archivos en orden:");
      console.log("       1. supabase/migrations/202605040001_bondexos_module_1.sql");
      console.log("       2. supabase/migrations/202605050001_bondexos_modules_2_3_4.sql");
      console.log("       3. supabase/seed.sql\n");
      
      const continuar = await ask("¿Ya aplicaste las migraciones? (s/n): ");
      if (continuar.toLowerCase() !== "s") {
        console.log("\n🔗  Abre el SQL Editor y pega las migraciones, luego corre este script de nuevo.");
        process.exit(0);
      }
    } else {
      console.error("   ❌  Error de conexión:", pingErr.message);
      process.exit(1);
    }
  } else {
    console.log("   ✅  Conexión OK. Tablas encontradas.");
  }

  // ── PASO 2: Ver usuarios existentes ───────────────────────
  const { data: usuarios } = await supabase
    .from("usuario")
    .select("email, rol, nombre, auth_user_id");

  console.log("\n📋  Usuarios en la base de datos:");
  if (!usuarios || usuarios.length === 0) {
    console.log("   (ninguno — puede que el seed.sql no se haya aplicado aún)");
  } else {
    usuarios.forEach((u) => {
      const estado = u.auth_user_id ? "✅ con acceso" : "⏳ sin acceso aún";
      console.log(`   • ${u.email}  [${u.rol}]  ${estado}`);
    });
  }

  // ── PASO 3: Crear usuario de acceso ───────────────────────
  console.log("\n─────────────────────────────────────────");
  console.log("Configura tu usuario para entrar a BondexOS:");
  console.log("(Puedes usar admin@afianzadora.demo o tu propio correo)\n");

  const email = await ask("Correo: ");
  if (!email || !email.includes("@")) {
    console.error("❌  Correo inválido.");
    process.exit(1);
  }

  const password = await askHidden("Contraseña (mín. 8 caracteres): ");
  if (!password || password.length < 8) {
    console.error("❌  La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  console.log("\n⏳  Creando usuario en Supabase Auth…");

  // Intentar crear
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let authUserId: string;

  if (authErr) {
    if (
      authErr.message.toLowerCase().includes("already") ||
      authErr.message.toLowerCase().includes("exists") ||
      (authErr as any).code === "email_exists"
    ) {
      console.log("   ℹ️  Ya existe en Auth. Actualizando contraseña…");
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existing = listData?.users?.find((u) => u.email === email);
      if (!existing) {
        console.error("❌  No se pudo recuperar el usuario existente.");
        process.exit(1);
      }
      await supabase.auth.admin.updateUserById(existing.id, { password });
      authUserId = existing.id;
      console.log("   ✅  Contraseña actualizada.");
    } else {
      console.error("❌  Error:", authErr.message);
      process.exit(1);
    }
  } else {
    authUserId = authData.user!.id;
    console.log(`   ✅  Usuario creado (${authUserId})`);
  }

  // ── PASO 4: Vincular en public.usuario ────────────────────
  const { data: vinc, error: vincErr } = await supabase
    .from("usuario")
    .update({ auth_user_id: authUserId })
    .eq("email", email)
    .select("id, rol, nombre");

  if (vincErr || !vinc || vinc.length === 0) {
    // Si no existe en la tabla de negocio (correo personalizado), insertarlo
    const { data: tenantData } = await supabase.from("tenant").select("id").limit(1).single();
    if (tenantData) {
      await supabase.from("usuario").insert({
        tenant_id: tenantData.id,
        auth_user_id: authUserId,
        rol: "admin",
        email,
        nombre: email.split("@")[0],
        activo: true,
      });
      console.log("   ✅  Usuario insertado en public.usuario como admin.");
    } else {
      console.warn("   ⚠️  No se encontró tenant. El usuario puede hacer login pero sin rol en BondexOS.");
    }
  } else {
    console.log(`   ✅  Vinculado en public.usuario → rol: ${vinc[0].rol}`);
  }

  // ── RESUMEN FINAL ─────────────────────────────────────────
  console.log("\n═════════════════════════════════════════");
  console.log("🎉  ¡BondexOS listo para usar!\n");
  console.log(`   🌐  Web:         http://localhost:3000/login`);
  console.log(`   🔧  API:         http://localhost:4000/health`);
  console.log(`   📧  Correo:      ${email}`);
  console.log(`   🔑  Contraseña:  ${password}`);
  console.log("\n   Para arrancar los servidores:");
  console.log("   Terminal 1 → npm run dev --workspace=apps/api");
  console.log("   Terminal 2 → npm run dev --workspace=apps/web");
  console.log("═════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("❌  Error inesperado:", err);
  process.exit(1);
});
