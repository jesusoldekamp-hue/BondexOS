import { createClient } from "@supabase/supabase-js";

async function run() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // 1. Obtener tenant
  const { data: tenantData } = await supabase.from("tenant").select("id").limit(1).single();
  if (!tenantData) throw new Error("No hay tenant");

  // 2. Obtener tu usuario admin
  const { data: adminUser } = await supabase.from("usuario").select("id").eq("email", "admin@afianzadora.demo").single();
  if (!adminUser) throw new Error("No hay admin");

  console.log("Creando Originador de prueba...");
  
  // 3. Insertar Originador (Broker)
  const { data: originador, error: oErr } = await supabase.from("originador").insert({
    tenant_id: tenantData.id,
    usuario_id: adminUser.id,
    tipo_originador: "broker_cedulado",
    cedula_num: "DEMO-123456",
    cedula_estado: "vigente",
    tipo_agente: "PF"
  }).select().single();
  
  if (oErr) console.error("Error originador:", oErr.message);

  console.log("Creando Expediente de prueba...");

  // 4. Insertar Expediente de Prueba
  const { error: eErr } = await supabase.from("expediente").insert({
    tenant_id: tenantData.id,
    originador_id: originador!.id,
    cliente_rfc: "DEMO990101XYZ",
    tipo_solicitante: "PM",
    tipo_fianza: "administrativa",
    estado: "borrador",
    monto_solicitado: 500000.00
  });

  if (eErr) console.error("Error expediente:", eErr.message);
  else console.log("✅ ¡Datos de prueba creados!");
}

run();
