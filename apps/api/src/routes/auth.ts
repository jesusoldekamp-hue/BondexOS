import { Router } from "express";
import { requireAuthenticatedTenant } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.get("/me", ...requireAuthenticatedTenant, (req, res) => {
  res.json({
    usuario: req.usuario,
    tenant: req.tenant,
    permisos: {
      puedeInvitarUsuarios: req.usuario?.rol === "admin",
      soloLectura: req.usuario?.rol === "auditor"
    }
  });
});
