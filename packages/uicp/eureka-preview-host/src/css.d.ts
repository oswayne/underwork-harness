declare module '*.css'

declare module '*?worker&inline' {
  const WorkerFactory: new () => unknown
  export default WorkerFactory
}
