-- ────────────────────────────────────────────────────────────
-- BondexOS Módulos 5, 6, 7, 8 — Scoring, Suscripción, Emisión, Monitoreo
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- M5: Análisis financiero (scoring persistente)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analisis_financiero (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    expediente_id UUID NOT NULL REFERENCES expediente(id),
    tipo_analisis TEXT NOT NULL CHECK (tipo_analisis IN ('ratios', 'patrimonial')),
    ratios_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    componentes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    pesos_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    score INTEGER CHECK (score >= 0 AND score <= 1000),
    recomendacion TEXT CHECK (recomendacion IN ('sin_garantia', 'obligado_solidario', 'garantia_inmobiliaria')),
    memo_texto TEXT,
    generado_por_ia BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE analisis_financiero ENABLE ROW LEVEL SECURITY;

CREATE POLICY analisis_financiero_tenant ON analisis_financiero
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_analisis_expediente ON analisis_financiero(expediente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analisis_unico ON analisis_financiero(expediente_id, tipo_analisis);

-- ────────────────────────────────────────────────────────────
-- M6: Decisiones de suscripción
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decision_suscripcion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    expediente_id UUID NOT NULL REFERENCES expediente(id),
    suscriptor_id UUID NOT NULL REFERENCES usuario(id),
    decision TEXT NOT NULL CHECK (decision IN ('aprobado', 'aprobado_con_condiciones', 'pendiente', 'rechazado')),
    condiciones TEXT,
    motivo_rechazo TEXT,
    monto_aprobado NUMERIC(15,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE decision_suscripcion ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_suscripcion_tenant ON decision_suscripcion
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_decision_expediente ON decision_suscripcion(expediente_id);

-- ────────────────────────────────────────────────────────────
-- M7: Pólizas emitidas
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poliza (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    expediente_id UUID NOT NULL REFERENCES expediente(id),
    numero_poliza TEXT NOT NULL,
    monto NUMERIC(15,2) NOT NULL,
    prima NUMERIC(15,2) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'emitida', 'error')),
    pdf_r2_key TEXT,
    pdf_r2_url TEXT,
    cfdi_uuid TEXT,
    cfdi_xml TEXT,
    cfdi_fecha_timbrado TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE poliza ENABLE ROW LEVEL SECURITY;

CREATE POLICY poliza_tenant ON poliza
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Idempotencia: un expediente solo puede tener una póliza
CREATE UNIQUE INDEX IF NOT EXISTS idx_poliza_expediente_unico ON poliza(expediente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_poliza_numero ON poliza(tenant_id, numero_poliza);
CREATE INDEX IF NOT EXISTS idx_poliza_vencimiento ON poliza(fecha_vencimiento);

-- Secuencial de pólizas por tenant
CREATE TABLE IF NOT EXISTS poliza_secuencial (
    tenant_id UUID PRIMARY KEY REFERENCES tenant(id),
    prefijo TEXT NOT NULL DEFAULT 'AFC',
    ultimo_secuencial INTEGER NOT NULL DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- M8: Alertas y monitoreo
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id),
    tipo TEXT NOT NULL CHECK (tipo IN (
        'cedula_vencimiento_90', 'cedula_vencimiento_60', 'cedula_vencimiento_30',
        'cedula_suspendida', 'cedula_cancelada',
        'poliza_vencimiento_90', 'poliza_vencimiento_60', 'poliza_vencimiento_30',
        'emision_error', 'reverificacion_fallo'
    )),
    entidad TEXT NOT NULL,
    entidad_id UUID,
    mensaje TEXT NOT NULL,
    enviada BOOLEAN NOT NULL DEFAULT FALSE,
    email_message_id TEXT,
    deduplication_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE alerta ENABLE ROW LEVEL SECURITY;

CREATE POLICY alerta_tenant ON alerta
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Deduplicación: evitar alertas repetidas
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerta_dedup ON alerta(tenant_id, deduplication_key);
CREATE INDEX IF NOT EXISTS idx_alerta_tipo ON alerta(tipo, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- M8: Dead Letter Queue (DLQ)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dlq_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name TEXT NOT NULL,
    job_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dlq_unresolved ON dlq_entry(resolved, failed_at DESC);
