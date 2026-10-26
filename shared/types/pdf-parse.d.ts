declare module 'pdf-parse/lib/pdf-parse.js' {
  const parse: (bytes: Buffer, options: { max: number }) => Promise<{ numpages: number; text: string }>
  export default parse
}
