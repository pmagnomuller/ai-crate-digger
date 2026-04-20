import { IsIn, IsString } from 'class-validator';

export class ChatHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}
