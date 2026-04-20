import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import request from 'supertest';
import { ChatController } from '../src/chat/chat.controller';
import { ChatService } from '../src/chat/chat.service';
import { TtsService } from '../src/tts/tts.service';

describe('ChatController (POST /chat/speak)', () => {
  let app: import('@nestjs/common').INestApplication;
  const synthesizeStream = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: { streamRecommendations: jest.fn() },
        },
        {
          provide: TtsService,
          useValue: { synthesizeStream },
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

  it('returns audio/mpeg binary stream and forwards voice to TtsService', async () => {
    const audioBytes = Buffer.from([0xff, 0xfb, 0x90]);
    synthesizeStream.mockResolvedValue({
      stream: Readable.from(audioBytes),
      mimeType: 'audio/mpeg',
    });

    const res = await request(app.getHttpServer())
      .post('/chat/speak')
      .send({ text: 'Hello', voice: 'onyx' })
      .expect(200)
      .expect('Content-Type', /audio\/mpeg/);

    const out = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body as string);
    expect(Buffer.compare(out, audioBytes)).toBe(0);
    expect(synthesizeStream).toHaveBeenCalledWith('Hello', { voice: 'onyx' });
  });

  it('rejects invalid voice', async () => {
    await request(app.getHttpServer())
      .post('/chat/speak')
      .send({ text: 'Hello', voice: 'alloy' })
      .expect(400);
  });

  it('returns 502 when TTS fails', async () => {
    synthesizeStream.mockRejectedValue(new Error('upstream'));

    await request(app.getHttpServer())
      .post('/chat/speak')
      .send({ text: 'Hello' })
      .expect(502)
      .expect((r) => {
        expect(r.body.message).toBe('upstream');
      });
  });
});
