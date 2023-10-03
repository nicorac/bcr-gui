
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'tagColor',
})
export class TagColorPipe implements PipeTransform {

  transform(tagBackgroundColorHex: string, options?: any) {
    // extract hex color (removing leading #)
    if (tagBackgroundColorHex.startsWith('#')) {
      tagBackgroundColorHex = tagBackgroundColorHex.slice(1);
    }
    // calculate foreground color
    const tagForegroundColorHex = this.getContrastYIQ(tagBackgroundColorHex);
    // return style
    return `color: ${tagForegroundColorHex}; background-color: #${tagBackgroundColorHex};`;
  }

  private getContrastYIQ(hexColor: string){
    const r = parseInt(hexColor.substring(0,2), 16);
    const g = parseInt(hexColor.substring(2,4), 16);
    const b = parseInt(hexColor.substring(4,6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : 'white';
  }


}