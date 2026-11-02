import schema from '../schemas/health-response.schema.json'

/** Wire format for GET /health; validation constants come from the shared schema. */
export interface HealthResponse {
  status: string
  service: string
  version: string
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === schema.required.length &&
    schema.required.every((key) => Object.prototype.hasOwnProperty.call(record, key)) &&
    Object.entries(schema.properties).every(([key, rule]) => record[key] === rule.const)
}
