export type SectionType = 
  | 'hero'
  | 'text'
  | 'image'
  | 'cta'
  | 'video';

export interface Section {
  id: string;
  type: string;
  order?: number;
  content: {
    title?: string;
    subtitle?: string;
    text?: string;
    imageUrl?: string;
    backgroundColor?: string;
    textColor?: string;
    ctaText?: string;
    ctaLink?: string;
    buttonType?: 'link' | 'join';
    layout?: string;
    altText?: string;
    caption?: string;
    videoId?: string;
    description?: string;
    width?: 'narrow' | 'medium' | 'full';
    background?: 'white' | 'light' | 'dark';
    overlayStyle?: 'gradient' | 'dark' | 'none';
    overlayColor?: string;
    backgroundMode?: 'background' | 'overlay' | 'none';
    disableHoverZoom?: boolean;
  };
}

export interface PageData {
  sections: Section[];
  meta: {
    lastUpdated: string;
    publishedVersion?: string;
  };
} 