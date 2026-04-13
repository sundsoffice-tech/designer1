---
description: Express 5 Backend, OpenAI Integration & API Design Standards
globs: "apps/backend/**"
---

# Backend Standards (Express 5 + OpenAI)

## 1. Express 5 API-Design
- Nutze native Promise-Unterstuetzung fuer async Routes (kein manuelles try/catch noetig).
- Alle Request-Payloads mit Zod validieren bevor sie verarbeitet werden.
- Stateless Validation: Frontend sendet komprimierten Szenengraph, Backend prueft und gibt Error-Tree oder Freigabe zurueck.
- SSE-Streaming fuer inkrementelle Preiskalkulation und KI-Feedback verwenden.

## 2. OpenAI Integration
- Ausschliesslich "Strict" Structured Outputs via JSON Schema/Zod fuer deterministische Ergebnisse.
- Orchestrator-Specialist Pattern: Nicht ein monolithisches LLM, sondern spezialisierte Agenten.
- Typisiertes Tool-Calling mit Zod-Schemas, Enums und Ranges um Halluzinationen zu minimieren.
- Pre-Context Filtering: Nur relevante Metadaten an die API senden, nicht den gesamten Szenengraph.

## 3. Preiskalkulation & Konfiguration
- Pricing ist Server-seitig die Source of Truth.
- Config-Persistence mit TTL (Standard: 8 Stunden).
- Kundenspezifische Multiplikatoren ueber Zod-validierte Config.
