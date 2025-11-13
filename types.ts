
export interface Chapter {
  title: string;
  content: string; // Markdown content
}

export interface Documentation {
  title: string;
  chapters: Chapter[];
}
