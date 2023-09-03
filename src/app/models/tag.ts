export interface Tag {
  // tag unique ID
  id: string;
  // tag color (CSS format, like "#aabbcc")
  color: string;
}

export function getDefaultTags(): Tag[] {
  return [
    { id: 'private', color: "#00ff00" },
    { id: 'work', color: "#0000ff" },
    { id: 'spam', color: "#ff0000" },
  ];
}