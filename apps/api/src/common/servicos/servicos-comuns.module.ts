import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { GeocodingService } from "./geocoding.service";

// Serviços de infraestrutura usados por mais de um módulo (e-mail por SMTP e
// geocodificação de endereço). Global pra não precisar importar em cada um.
@Global()
@Module({
  providers: [MailService, GeocodingService],
  exports: [MailService, GeocodingService],
})
export class ServicosComunsModule {}
