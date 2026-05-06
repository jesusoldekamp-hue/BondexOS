/**
 * Demo script: ejecuta M2 BrokerGuard, M3 Storage y M4 Motor IA
 * en modo sandbox para demostrar que los módulos funcionan.
 *
 * Uso: npx tsx apps/api/src/scripts/demo-modules.ts
 */

import {
  createBrokerGuardAdapter,
  createDocumentStorageAdapter,
  createAnthropicAdapter
} from "@bondexos/integrations";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const ORIGINADOR_ID = "00000000-0000-0000-0000-000000000002";
const EXPEDIENTE_ID = "00000000-0000-0000-0000-000000000003";

async function demoM2() {
  console.log("\n" + "=".repeat(60));
  console.log("  MÓDULO 2 — BrokerGuard (Verificación de Cédulas)");
  console.log("=".repeat(60));

  const bg = createBrokerGuardAdapter({ mode: "sandbox" });

  const health = await bg.health();
  console.log("\n🩺 Health:", JSON.stringify(health, null, 2));

  // Cédula vigente
  const vigente = await bg.verify({
    tenantId: TENANT_ID,
    originadorId: ORIGINADOR_ID,
    cedulaNum: "ABC123"
  });
  console.log("\n✅ Cédula vigente:");
  console.log(`   Estado: ${vigente.estado}`);
  console.log(`   Vence: ${vigente.vence}`);
  console.log(`   Bloquea operación: ${vigente.bloqueaOperacion}`);
  console.log(`   Fuente: ${vigente.fuente}`);

  // Cédula suspendida
  const suspendida = await bg.verify({
    tenantId: TENANT_ID,
    originadorId: ORIGINADOR_ID,
    cedulaNum: "SUSP-789"
  });
  console.log("\n🚫 Cédula SUSPENDIDA:");
  console.log(`   Estado: ${suspendida.estado}`);
  console.log(`   Bloquea operación: ${suspendida.bloqueaOperacion}`);
  console.log(`   Detalle: ${suspendida.detalle}`);

  // Cédula cancelada
  const cancelada = await bg.verify({
    tenantId: TENANT_ID,
    originadorId: ORIGINADOR_ID,
    cedulaNum: "CANC-456"
  });
  console.log("\n❌ Cédula CANCELADA:");
  console.log(`   Estado: ${cancelada.estado}`);
  console.log(`   Bloquea operación: ${cancelada.bloqueaOperacion}`);

  // Falla técnica (no bloquea)
  const fallback = await bg.verify({
    tenantId: TENANT_ID,
    originadorId: ORIGINADOR_ID,
    cedulaNum: "ERR-TIMEOUT"
  });
  console.log("\n⚠️  Falla técnica (fallback):");
  console.log(`   Estado: ${fallback.estado}`);
  console.log(`   Bloquea operación: ${fallback.bloqueaOperacion}`);
  console.log(`   Fuente: ${fallback.fuente}`);

  // Cache hit
  const cacheHit = await bg.verify({
    tenantId: TENANT_ID,
    originadorId: ORIGINADOR_ID,
    cedulaNum: "ABC123"
  });
  console.log("\n💾 Cache hit (segunda consulta misma cédula):");
  console.log(`   Fuente: ${cacheHit.fuente}`);
  console.log(`   Estado: ${cacheHit.estado}`);
}

async function demoM3() {
  console.log("\n" + "=".repeat(60));
  console.log("  MÓDULO 3 — Storage R2 (Documentos)");
  console.log("=".repeat(60));

  const storage = createDocumentStorageAdapter({ mode: "sandbox" });

  const health = await storage.health();
  console.log("\n🩺 Health:", JSON.stringify(health, null, 2));

  const upload = await storage.createUploadUrl({
    tenantId: TENANT_ID,
    expedienteId: EXPEDIENTE_ID,
    documentoId: "doc-001",
    filename: "estados_financieros_2025.pdf",
    contentType: "application/pdf"
  });
  console.log("\n📤 URL presigned para carga:");
  console.log(`   Upload URL: ${upload.url}`);
  console.log(`   R2 Key: ${upload.key}`);
  console.log(`   Expira: ${upload.expiresAt}`);
}

async function demoM4() {
  console.log("\n" + "=".repeat(60));
  console.log("  MÓDULO 4 — Motor IA (Anthropic Sandbox)");
  console.log("=".repeat(60));

  const ai = createAnthropicAdapter({ mode: "sandbox" });

  const health = await ai.health();
  console.log("\n🩺 Health:", JSON.stringify(health, null, 2));

  // Clasificar documento
  const clasificacion = await ai.runJob({
    tipo: "clasificar_documento",
    expedienteId: EXPEDIENTE_ID,
    documentoId: "doc-001"
  });
  console.log("\n📄 Clasificar documento:");
  console.log(`   Estado: ${clasificacion.estado}`);
  console.log(`   Output:`, JSON.stringify(clasificacion.outputJson, null, 2));

  // Extraer datos
  const extraccion = await ai.runJob({
    tipo: "extraer_datos",
    expedienteId: EXPEDIENTE_ID,
    documentoId: "doc-001"
  });
  console.log("\n🔍 Extraer datos:");
  console.log(`   Estado: ${extraccion.estado}`);
  console.log(`   Output:`, JSON.stringify(extraccion.outputJson, null, 2));

  // Análisis financiero
  const analisis = await ai.runJob({
    tipo: "analizar_financiero",
    expedienteId: EXPEDIENTE_ID
  });
  console.log("\n📊 Análisis financiero:");
  console.log(`   Estado: ${analisis.estado}`);
  console.log(`   Score: ${(analisis.outputJson as Record<string, unknown>).score}`);
  console.log(`   Recomendación: ${(analisis.outputJson as Record<string, unknown>).recomendacion}`);
  console.log(`   Output:`, JSON.stringify(analisis.outputJson, null, 2));

  // Generar memo de suscripción
  const memo = await ai.runJob({
    tipo: "generar_memo",
    expedienteId: EXPEDIENTE_ID
  });
  console.log("\n📝 Memo de suscripción:");
  console.log(`   Estado: ${memo.estado}`);
  console.log(`   Output:`, JSON.stringify(memo.outputJson, null, 2));
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         BondexOS — Demo Módulos M2, M3 y M4            ║");
  console.log("║         Todos en modo SANDBOX (sin APIs reales)         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  await demoM2();
  await demoM3();
  await demoM4();

  console.log("\n" + "=".repeat(60));
  console.log("  ✅ DEMO COMPLETA — Los 3 módulos funcionan correctamente");
  console.log("=".repeat(60) + "\n");
}

main().catch((error) => {
  console.error("Error en demo:", error);
  process.exit(1);
});
