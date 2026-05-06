import type { DocumentoEstado, PfRutaCapacidad, TipoSolicitante } from "./enums.js";

export const CHECKLIST_VERSION = "2026.05.modulo-3";

export interface ChecklistDefinition {
  codigo: string;
  nombre: string;
  obligatorio: boolean;
  orden: number;
  aplica: {
    tipoSolicitante: readonly TipoSolicitante[];
    pfRutaCapacidad?: readonly PfRutaCapacidad[];
  };
  condicion?: "pf_estado_civil_casado";
}

export interface ChecklistOverride {
  activo?: boolean;
  obligatorio?: boolean;
  nombre?: string;
}

export interface ChecklistTenantConfig {
  checklistOverrides?: Record<string, ChecklistOverride>;
}

export interface BuildChecklistInput {
  tipoSolicitante: TipoSolicitante;
  pfRutaCapacidad?: PfRutaCapacidad | null;
  pfEstadoCivil?: string | null;
  tenantConfig?: ChecklistTenantConfig | null;
}

export interface MaterializedChecklistItem {
  tipo: string;
  nombre: string;
  obligatorio: boolean;
  estado: DocumentoEstado;
  checklistVersion: string;
  orden: number;
  condicion?: string;
}

export const CHECKLIST_DEFINITIONS: readonly ChecklistDefinition[] = [
  {
    codigo: "acta_constitutiva",
    nombre: "Acta constitutiva",
    obligatorio: true,
    orden: 10,
    aplica: { tipoSolicitante: ["PM"] }
  },
  {
    codigo: "poder_representante",
    nombre: "Poder del representante legal",
    obligatorio: true,
    orden: 20,
    aplica: { tipoSolicitante: ["PM"] }
  },
  {
    codigo: "identificacion_representante",
    nombre: "Identificacion oficial del representante",
    obligatorio: true,
    orden: 30,
    aplica: { tipoSolicitante: ["PM"] }
  },
  {
    codigo: "constancia_situacion_fiscal_pm",
    nombre: "Constancia de situacion fiscal",
    obligatorio: true,
    orden: 40,
    aplica: { tipoSolicitante: ["PM"] }
  },
  {
    codigo: "estados_financieros_pm",
    nombre: "Estados financieros de los ultimos dos ejercicios",
    obligatorio: true,
    orden: 50,
    aplica: { tipoSolicitante: ["PM"] }
  },
  {
    codigo: "opinion_cumplimiento_pm",
    nombre: "Opinion de cumplimiento SAT",
    obligatorio: true,
    orden: 60,
    aplica: { tipoSolicitante: ["PM"] }
  },
  {
    codigo: "contrato_fuente",
    nombre: "Contrato u obligacion fuente",
    obligatorio: true,
    orden: 70,
    aplica: { tipoSolicitante: ["PM", "PF"] }
  },
  {
    codigo: "identificacion_pf",
    nombre: "Identificacion oficial",
    obligatorio: true,
    orden: 110,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C1", "C2"] }
  },
  {
    codigo: "curp_rfc_pf",
    nombre: "CURP y RFC",
    obligatorio: true,
    orden: 120,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C1", "C2"] }
  },
  {
    codigo: "comprobante_domicilio_pf",
    nombre: "Comprobante de domicilio",
    obligatorio: true,
    orden: 130,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C1", "C2"] }
  },
  {
    codigo: "estados_cuenta_pf_c1",
    nombre: "Estados de cuenta bancarios ultimos seis meses",
    obligatorio: true,
    orden: 140,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C1"] }
  },
  {
    codigo: "relacion_patrimonial_pf_c1",
    nombre: "Relacion patrimonial firmada",
    obligatorio: true,
    orden: 150,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C1"] }
  },
  {
    codigo: "acta_matrimonio_pf",
    nombre: "Acta de matrimonio",
    obligatorio: false,
    orden: 160,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C1", "C2"] },
    condicion: "pf_estado_civil_casado"
  },
  {
    codigo: "declaracion_anual_pf_c2",
    nombre: "Declaracion anual",
    obligatorio: true,
    orden: 210,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C2"] }
  },
  {
    codigo: "estados_financieros_pf_c2",
    nombre: "Estados financieros de actividad empresarial",
    obligatorio: true,
    orden: 220,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C2"] }
  },
  {
    codigo: "opinion_cumplimiento_pf_c2",
    nombre: "Opinion de cumplimiento SAT",
    obligatorio: true,
    orden: 230,
    aplica: { tipoSolicitante: ["PF"], pfRutaCapacidad: ["C2"] }
  }
];

function appliesToExpediente(definition: ChecklistDefinition, input: BuildChecklistInput): boolean {
  if (!definition.aplica.tipoSolicitante.includes(input.tipoSolicitante)) {
    return false;
  }

  if (input.tipoSolicitante === "PF") {
    const allowedRoutes = definition.aplica.pfRutaCapacidad;
    return !allowedRoutes || (!!input.pfRutaCapacidad && allowedRoutes.includes(input.pfRutaCapacidad));
  }

  return true;
}

function conditionIsActive(definition: ChecklistDefinition, input: BuildChecklistInput): boolean {
  if (!definition.condicion) {
    return true;
  }

  if (definition.condicion === "pf_estado_civil_casado") {
    return (input.pfEstadoCivil ?? "").trim().toLowerCase() === "casado";
  }

  return true;
}

export function buildChecklistForExpediente(input: BuildChecklistInput): MaterializedChecklistItem[] {
  const overrides = input.tenantConfig?.checklistOverrides ?? {};

  return CHECKLIST_DEFINITIONS.filter((definition) => appliesToExpediente(definition, input))
    .filter((definition) => conditionIsActive(definition, input))
    .flatMap((definition) => {
      const override = overrides[definition.codigo];
      if (override?.activo === false) {
        return [];
      }

      const baseItem = {
        tipo: definition.codigo,
        nombre: override?.nombre ?? definition.nombre,
        obligatorio: override?.obligatorio ?? definition.obligatorio,
        estado: "pendiente" as const,
        checklistVersion: CHECKLIST_VERSION,
        orden: definition.orden
      };

      if (!definition.condicion) {
        return [baseItem];
      }

      return [
        {
          ...baseItem,
          condicion: definition.condicion
        }
      ];
    })
    .sort((left, right) => left.orden - right.orden);
}

export function calculateRequiredDocumentProgress(
  documentos: readonly Pick<MaterializedChecklistItem, "obligatorio" | "estado">[]
): number {
  const required = documentos.filter((documento) => documento.obligatorio);
  if (required.length === 0) {
    return 100;
  }

  const valid = required.filter((documento) => documento.estado === "validado");
  return Math.round((valid.length / required.length) * 100);
}

export function hasCompleteRequiredDocuments(
  documentos: readonly Pick<MaterializedChecklistItem, "obligatorio" | "estado">[]
): boolean {
  return calculateRequiredDocumentProgress(documentos) === 100;
}
