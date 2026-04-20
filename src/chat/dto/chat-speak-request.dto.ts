import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TTS_VOICES, type TtsVoice } from '../../tts/tts.service';

export class ChatSpeakRequestDto {
  @IsString()
  @MaxLength(4096)
  text!: string;

  @IsOptional()
  @IsIn([...TTS_VOICES])
  voice?: TtsVoice;
}
