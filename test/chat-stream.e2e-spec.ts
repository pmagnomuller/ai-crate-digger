import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { of } from 'rxjs';
import { ChatController } from '../src/chat/chat.controller';
import { ChatService } from '../src/chat/chat.service';
import { TtsService } from '../src/tts/tts.service';

describe('ChatController (POST /chat/stream)', () => {
  let app: import('@nestjs/common').INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            streamRecommendations: () =>
              of(
                { type: 'session_start', data: { maxToolRounds: 5, includeAudio: true } },
                { type: 'final_answer', data: { text: 'done' } },
              ),
          },
        },
        {
          provide: TtsService,
          useValue: { synthesizeStream: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns SSE with session_start and final_answer', async () => {
    const res = await request(app.getHttpServer())
      .post('/chat/stream')
      .send({ prompt: 'hello' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    expect(res.text).toContain('session_start');
    expect(res.text).toContain('final_answer');
  });

  it('rejects invalid body', async () => {
    await request(app.getHttpServer())
      .post('/chat/stream')
      .send({ prompt: 123 })
      .expect(400);
  });
});
