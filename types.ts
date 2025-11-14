export interface Chapter {
  title: string;
  content: string; // Markdown content
  subChapters?: Chapter[];
}

export interface Documentation {
  title: string;
  chapters: Chapter[];
}

export interface AudioConfig {
    voice: string;
    speed: number;
}