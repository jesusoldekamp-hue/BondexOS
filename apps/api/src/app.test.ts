import { EventEmitter } from "node:events";
import { createRequest, createResponse, type RequestOptions } from "node-mocks-http";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createTestServices, type TestServicesState } from "./test/testServices.js";
import type { UsuarioContext } from "./services/types.js";

const tenantA = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Tenant A",
  plan: "piloto",
  config: {}
};

const adminUser: UsuarioContext = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenantId: tenantA.id,
  authUserId: "auth-admin",
  email: "admin@bondexos.mx",
  nombre: "Admin BondexOS",
  rol: "admin",
  activo: true
};

const inactiveUser: UsuarioContext = {
  ...adminUser,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  authUserId: "auth-inactive",
  email: "inactive@bondexos.mx",
  activo: false
};

const auditorUser: UsuarioContext = {
  ...adminUser,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  authUserId: "auth-auditor",
  email: "auditor@bondexos.mx",
  rol: "auditor"
};

const brokerUser: UsuarioContext = {
  ...adminUser,
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  authUserId: "auth-broker",
  email: "broker@bondexos.mx",
  rol: "broker"
};

const vendedorUser: UsuarioContext = {
  ...adminUser,
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  authUserId: "auth-vendedor",
  email: "vendedor@bondexos.mx",
  rol: "vendedor"
};

function buildState(): TestServicesState {
  return {
    tokens: new Map([
      ["admin-token", { id: "auth-admin", email: adminUser.email }],
      ["inactive-token", { id: "auth-inactive", email: inactiveUser.email }],
      ["auditor-token", { id: "auth-auditor", email: auditorUser.email }],
      ["broker-token", { id: "auth-broker", email: brokerUser.email }],
      ["vendedor-token", { id: "auth-vendedor", email: vendedorUser.email }]
    ]),
    usersByAuthId: new Map([
      ["auth-admin", adminUser],
      ["auth-inactive", inactiveUser],
      ["auth-auditor", auditorUser],
      ["auth-broker", brokerUser],
      ["auth-vendedor", vendedorUser]
    ]),
    tenants: new Map([[tenantA.id, tenantA]]),
    audits: [],
    invitedUsers: [],
    originadores: new Map([
      [
        "11111111-0000-4000-8000-000000000001",
        {
          id: "11111111-0000-4000-8000-000000000001",
          tenantId: tenantA.id,
          usuarioId: brokerUser.id,
          tipoOriginador: "broker_cedulado",
          cedulaNum: "BROKER-SUSP",
          cedulaEstado: "suspendida",
          cedulaVence: "2027-05-05",
          cedulaVerificadoEn: new Date().toISOString(),
          cedulaFuente: "sandbox",
          cedulaDetalle: "Suspendida",
          tipoAgente: "Agente de fianzas"
        }
      ],
      [
        "11111111-0000-4000-8000-000000000002",
        {
          id: "11111111-0000-4000-8000-000000000002",
          tenantId: tenantA.id,
          usuarioId: brokerUser.id,
          tipoOriginador: "broker_cedulado",
          cedulaNum: "BROKER-ERR",
          cedulaEstado: "verificacion_pendiente",
          cedulaVence: null,
          cedulaVerificadoEn: null,
          cedulaFuente: null,
          cedulaDetalle: null,
          tipoAgente: "Agente de fianzas"
        }
      ],
      [
        "11111111-0000-4000-8000-000000000003",
        {
          id: "11111111-0000-4000-8000-000000000003",
          tenantId: tenantA.id,
          usuarioId: vendedorUser.id,
          tipoOriginador: "vendedor_interno",
          cedulaNum: null,
          cedulaEstado: null,
          cedulaVence: null,
          cedulaVerificadoEn: null,
          cedulaFuente: null,
          cedulaDetalle: null,
          tipoAgente: null
        }
      ]
    ]),
    expedientes: new Map(),
    documentos: new Map(),
    aiJobs: new Map(),
    uploads: []
  };
}

type HttpMethod = "GET" | "POST" | "PATCH";

interface InvokeOptions {
  method: HttpMethod;
  url: string;
  token?: string;
  body?: Record<string, unknown>;
}

async function invokeApp(app: ReturnType<typeof createApp>, options: InvokeOptions) {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.body) {
    headers["content-type"] = "application/json";
  }

  const requestOptions: RequestOptions = {
    method: options.method,
    url: options.url,
    headers
  };
  if (options.body) {
    requestOptions.body = options.body;
  }

  const req = createRequest(requestOptions);
  const res = createResponse({ eventEmitter: EventEmitter });

  await new Promise<void>((resolve, reject) => {
    res.on("end", resolve);
    res.on("error", reject);
    app(req, res);
  });

  return {
    status: res._getStatusCode(),
    body: res._getJSONData() as unknown
  };
}

describe("BondexOS API Modulo 1", () => {
  let state: TestServicesState;

  beforeEach(() => {
    state = buildState();
  });

  it("responde health check publico", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, { method: "GET", url: "/health" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
  });

  it("rechaza endpoint protegido sin token", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, { method: "GET", url: "/api/v1/auth/me" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "auth_required" } });
  });

  it("rechaza usuario inactivo", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "GET",
      url: "/api/v1/auth/me",
      token: "inactive-token"
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "user_inactive" } });
  });

  it("devuelve perfil autenticado con tenant", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "GET",
      url: "/api/v1/auth/me",
      token: "admin-token"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      usuario: { email: adminUser.email },
      tenant: { id: tenantA.id }
    });
  });

  it("permite a admin invitar usuario dentro de su tenant", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/admin/invitations",
      token: "admin-token",
      body: {
        email: "suscriptor@bondexos.mx",
        nombre: "Suscriptor Demo",
        rol: "suscriptor"
      }
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      user: {
        tenantId: tenantA.id,
        rol: "suscriptor"
      }
    });
    expect(state.invitedUsers).toHaveLength(1);
    expect(state.audits.some((audit) => audit.accion === "usuario.invitar")).toBe(true);
  });

  it("impide mutaciones de auditor", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/admin/invitations",
      token: "auditor-token",
      body: {
        email: "otro@bondexos.mx",
        nombre: "Otro Usuario",
        rol: "broker"
      }
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "forbidden" } });
  });

  it("lista solo usuarios del tenant autenticado", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "GET",
      url: "/api/v1/admin/users",
      token: "admin-token"
    });
    const body = response.body as { users: UsuarioContext[] };

    expect(response.status).toBe(200);
    expect(body.users).toHaveLength(5);
    expect(body.users.every((user) => user.tenantId === tenantA.id)).toBe(true);
  });

  it("BrokerGuard bloquea broker con cedula suspendida al crear expediente", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/expedientes",
      token: "broker-token",
      body: {
        originadorId: "11111111-0000-4000-8000-000000000001",
        clienteRfc: "BLOQ010101AA1",
        tipoSolicitante: "PM",
        tipoFianza: "administrativa",
        montoSolicitado: 1500000
      }
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "brokerguard_blocked" } });
  });

  it("permite vendedor interno sin cedula y materializa checklist PF C1", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/expedientes",
      token: "vendedor-token",
      body: {
        originadorId: "11111111-0000-4000-8000-000000000003",
        clienteRfc: "XAXX010101000",
        tipoSolicitante: "PF",
        pfRutaCapacidad: "C1",
        pfEstadoCivil: "soltero",
        tipoFianza: "arrendamiento",
        montoSolicitado: 250000
      }
    });
    const body = response.body as { documentos: Array<{ obligatorio: boolean; estado: string }> };

    expect(response.status).toBe(201);
    expect(body.documentos.length).toBeGreaterThan(0);
    expect(body.documentos.every((documento) => documento.estado === "pendiente")).toBe(true);
    expect(body.documentos.some((documento) => documento.obligatorio)).toBe(true);
  });

  it("permite broker con falla tecnica pendiente porque no bloquea", async () => {
    const app = createApp({ services: createTestServices(state) });
    const response = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/expedientes",
      token: "broker-token",
      body: {
        originadorId: "11111111-0000-4000-8000-000000000002",
        clienteRfc: "PEND010101AA1",
        tipoSolicitante: "PM",
        tipoFianza: "fiscal",
        montoSolicitado: 750000
      }
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      expediente: {
        estado: "en_proceso"
      }
    });
  });

  it("impide envio a suscripcion hasta validar todos los obligatorios", async () => {
    const app = createApp({ services: createTestServices(state) });
    const created = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/expedientes",
      token: "vendedor-token",
      body: {
        originadorId: "11111111-0000-4000-8000-000000000003",
        clienteRfc: "SUBM010101AA1",
        tipoSolicitante: "PM",
        tipoFianza: "administrativa",
        montoSolicitado: 500000
      }
    });
    const createdBody = created.body as {
      expediente: { id: string };
      documentos: Array<{ id: string; obligatorio: boolean }>;
    };

    const blocked = await invokeApp(app, {
      method: "POST",
      url: `/api/v1/expedientes/${createdBody.expediente.id}/submit`,
      token: "vendedor-token"
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({
      error: { code: "documentos_obligatorios_incompletos" }
    });

    for (const documento of createdBody.documentos.filter((item) => item.obligatorio)) {
      const validated = await invokeApp(app, {
        method: "PATCH",
        url: `/api/v1/expedientes/${createdBody.expediente.id}/documentos/${documento.id}`,
        token: "admin-token",
        body: {
          estado: "validado",
          fuenteValidacion: "test"
        }
      });
      expect(validated.status).toBe(200);
    }

    const submitted = await invokeApp(app, {
      method: "POST",
      url: `/api/v1/expedientes/${createdBody.expediente.id}/submit`,
      token: "vendedor-token"
    });

    expect(submitted.status).toBe(200);
    expect(submitted.body).toMatchObject({
      expediente: {
        estado: "en_suscripcion",
        progresoObligatorio: 100
      }
    });
  });

  it("genera URL presigned de PDF y encola jobs IA validos", async () => {
    const app = createApp({ services: createTestServices(state) });
    const created = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/expedientes",
      token: "vendedor-token",
      body: {
        originadorId: "11111111-0000-4000-8000-000000000003",
        clienteRfc: "AIIA010101AA1",
        tipoSolicitante: "PM",
        tipoFianza: "credito",
        montoSolicitado: 900000
      }
    });
    const createdBody = created.body as {
      expediente: { id: string };
      documentos: Array<{ id: string }>;
    };
    const documentoId = createdBody.documentos[0]?.id;
    if (!documentoId) {
      throw new Error("Documento esperado para prueba de upload.");
    }

    const upload = await invokeApp(app, {
      method: "POST",
      url: `/api/v1/expedientes/${createdBody.expediente.id}/documentos/${documentoId}/upload-url`,
      token: "vendedor-token",
      body: {
        filename: "contrato.pdf",
        contentType: "application/pdf",
        sizeBytes: 12000
      }
    });
    expect(upload.status).toBe(200);
    expect(upload.body).toMatchObject({ upload: { key: expect.any(String), url: expect.any(String) } });

    const invalidJob = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/ai/jobs",
      token: "admin-token",
      body: {
        expedienteId: createdBody.expediente.id,
        tipo: "clasificar_documento"
      }
    });
    expect(invalidJob.status).toBe(400);

    const validJob = await invokeApp(app, {
      method: "POST",
      url: "/api/v1/ai/jobs",
      token: "admin-token",
      body: {
        expedienteId: createdBody.expediente.id,
        documentoId,
        tipo: "clasificar_documento"
      }
    });
    expect(validJob.status).toBe(201);
    expect(validJob.body).toMatchObject({ job: { tipo: "clasificar_documento", estado: "pendiente" } });
  });
});
