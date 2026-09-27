export interface InteractionState {
  kind?: string;
  name?: string;
  index?: number;
  html?: string;
  text?: string;
  sources?: string[];
  states?: { html: string; text?: string }[];
}
export interface ReferenceContent {
  title: string;
  url: string;
  html: string;
  states: {
    "interaction-states"?: InteractionState[];
    "methods-states"?: InteractionState[];
    "plain-language"?: { html: string };
  };
}
