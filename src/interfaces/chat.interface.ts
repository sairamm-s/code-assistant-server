export interface SendMessageBody {
  message: string;
}

export interface ChatCitation {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

export interface ChatMessageSummary {
  id: string;
  role: string;
  content: string;
  citations: ChatCitation[] | null;
  createdAt: Date;
}
