import type { CommandId } from "../store/commandTypes";

export type UserRole = "guest" | "viewer" | "sales" | "editor" | "admin";

const roleRank: Record<UserRole, number> = {
  guest: 0,
  viewer: 1,
  sales: 2,
  editor: 3,
  admin: 4,
};

const commandMinRole: Partial<Record<CommandId, UserRole>> = {
  delete: "editor",
  duplicate: "editor",
  changeMaterial: "editor",
  changeScreenVideo: "editor",
  toggleCollisionLock: "admin",
};

export const resolveRole = (input?: UserRole): UserRole => input ?? "guest";

export const hasRoleAtLeast = (role: UserRole, required: UserRole) =>
  roleRank[resolveRole(role)] >= roleRank[resolveRole(required)];

export const canExecuteCommandForRole = (role: UserRole, command: CommandId): boolean => {
  const required = commandMinRole[command];
  if (!required) return true;
  return hasRoleAtLeast(role, required);
};

export const isCommandVisibleForRole = (role: UserRole, command: CommandId): boolean =>
  canExecuteCommandForRole(role, command);
