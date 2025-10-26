// src/types/svg.d.ts
declare module "*.svg?react" {
  import * as React from "react";
  const Component: React.FC<React.SVGProps<SVGSVGElement>>;
  export default Component;
}

declare module "*.svg" {
  const src: string; // URL string when imported without ?react
  export default src;
}
