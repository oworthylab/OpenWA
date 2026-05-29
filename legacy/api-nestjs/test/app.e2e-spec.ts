import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    for (const name of ['main', 'data']) {
      const dataSource = moduleFixture.get<DataSource>(getDataSourceToken(name), {
        strict: false,
      });
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }

    await app.close().catch(() => undefined);
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(body.timestamp).toBeDefined();
      });
  });
});
