---
description: Shared Package Standards - Typen, Schemas, Konfiguration
globs: "packages/shared/**"
---

# Shared Package Standards

## 1. Typen & Schemas
- Alle zwischen Frontend und Backend geteilten Typen gehoeren AUSSCHLIESSLICH in packages/shared.
- Zod-Schemas als Single Source of Truth fuer Validierung (Frontend UND Backend).
- TypeScript-Typen aus Zod-Schemas ableiten (`z.infer<typeof schema>`), nicht manuell duplizieren.

## 2. Konfiguration
- Module-Definitionen, Textur-Konfigurationen und Layout-Presets zentral verwalten.
- Aenderungen an shared muessen sowohl Frontend als auch Backend beruecksichtigen.
