export interface RedditSourceConfig {
  subreddits: string[];
  listing?: "new" | "top" | "hot";
  includeComments?: boolean;
  maxCommentCount?: number;
}


