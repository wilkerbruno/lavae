import { SetMetadata } from "@nestjs/common";
import { Papel } from "@lavajato-app/shared";

export const ROLES_KEY = "roles";

// Uso: @Roles(Papel.LAVAJATO_ADMIN, Papel.SAAS_ADMIN)
export const Roles = (...papeis: Papel[]) => SetMetadata(ROLES_KEY, papeis);
