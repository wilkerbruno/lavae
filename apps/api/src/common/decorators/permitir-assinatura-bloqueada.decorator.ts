import { SetMetadata } from "@nestjs/common";

export const PERMITIR_ASSINATURA_BLOQUEADA_KEY = "permitirAssinaturaBloqueada";

// Uso: @PermitirAssinaturaBloqueada() em rotas que a equipe de um lava jato
// bloqueada ainda precisa acessar (ex: ver/pagar a própria assinatura) — sem
// isso, o AssinaturaGuard barra FUNCIONARIO/LAVAJATO_ADMIN assim que a
// assinatura sai de TRIAL/ATIVA.
export const PermitirAssinaturaBloqueada = () => SetMetadata(PERMITIR_ASSINATURA_BLOQUEADA_KEY, true);
