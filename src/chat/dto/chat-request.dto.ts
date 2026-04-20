import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TTS_VOICES, type TtsVoice } from '../../tts/tts.service';
import { ChatHistoryMessageDto } from './chat-history-message.dto';

export class ChatRequestDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  history?: ChatHistoryMessageDto[];

  /** When false, skips TTS and omits `audio` from `final_answer` (smaller payloads). */
  @IsOptional()
  @IsBoolean()
  includeAudio?: boolean;

  /** TTS voice for `final_answer` audio (`onyx` or `nova`; default `nova`). */
  @IsOptional()
  @IsIn([...TTS_VOICES])
  voice?: TtsVoice;

  /** Max records returned per `search_records` call (default 6). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  maxResults?: number;

  /** Model response verbosity (Responses API `text.verbosity`). */
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  verbosity?: 'low' | 'medium' | 'high';

  /** Max tool-call rounds (search → detail → …) per request. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxToolRounds?: number;
}
