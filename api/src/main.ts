import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  // Explicite plutôt que de compter sur l'automatique — la passerelle
  // WebSocket de la messagerie (MessagingGateway) a besoin de cet
  // adaptateur pour fonctionner avec socket.io.
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`mon511 API démarrée sur le port ${port}`);
}
bootstrap();
