import { filesize } from 'filesize';
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filesize',
})
export class FilesizePipe implements PipeTransform {

  transform(value: number, options?: any) {
    return filesize(value, options).toString();
  }

}