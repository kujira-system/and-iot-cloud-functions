import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/filters';
import * as express from 'express';
import * as functions from 'firebase-functions';

const server = express();

export const createNestServer = async (expressInstance) => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api');

  return app.init();
};



createNestServer(server)
    .then(v => console.log('Nest Ready'))
    .catch(err => console.error('Nest broken', err));

export const api = functions.https.onRequest(server);

// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import {
//   ExpressAdapter,
// } from '@nestjs/platform-express';
// import * as express from 'express';
// import * as functions from 'firebase-functions';

// const server = express();

// const applicationReady = (async () => {
//   const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
//   app.enableCors();
//   return app.init();
// })();

// export const api = functions
//   .https.onRequest(async (...args) => {
//     await applicationReady;
//     server(...args);
//   });