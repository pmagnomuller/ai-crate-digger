import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Sse,
  StreamableFile,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { DEFAULT_TTS_VOICE, TtsService } from '../tts/tts.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatSpeakRequestDto } from './dto/chat-speak-request.dto';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly ttsService: TtsService,
  ) {}

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @Sse()
  stream(@Body() dto: ChatRequestDto): Observable<MessageEvent> {
    return this.chatService.streamRecommendations(dto).pipe(
      map((event) => ({ data: JSON.stringify(event) }) as MessageEvent),
    );
  }

  @Post('speak')
  @HttpCode(HttpStatus.OK)
  async speak(@Body() dto: ChatSpeakRequestDto): Promise<StreamableFile> {
    try {
      const { stream, mimeType } = await this.ttsService.synthesizeStream(dto.text, {
        voice: dto.voice ?? DEFAULT_TTS_VOICE,
      });
      const ext = mimeType === 'audio/mpeg' ? 'mp3' : 'audio';
      return new StreamableFile(stream, {
        type: mimeType,
        disposition: `inline; filename="speech.${ext}"`,
      });
    } catch (err) {
      throw new HttpException(
        { message: err instanceof Error ? err.message : 'TTS synthesis failed' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
