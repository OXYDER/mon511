declare module 'piexifjs' {
  const piexif: {
    load(jpegBinaryString: string): any;
    dump(exifObj: any): string;
    insert(exifBytes: string, jpegBinaryString: string): string;
    remove(jpegBinaryString: string): string;
  };
  export default piexif;
}
