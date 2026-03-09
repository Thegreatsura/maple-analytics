import type { AuthMode, OrgId, RoleName, UserId } from "@maple/domain/http"

export interface TenantContext {
  orgId: OrgId
  userId: UserId
  roles: RoleName[]
  authMode: AuthMode
}
