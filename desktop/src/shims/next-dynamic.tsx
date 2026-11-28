import { lazy, Suspense, type ComponentProps, type ComponentType, type ReactNode } from "react";

type Loader<P> = () => Promise<ComponentType<P> | { default: ComponentType<P> }>;

/** next/dynamic → React.lazy. (`ssr` is meaningless here: there's no server render.) */
export default function dynamic<P extends object>(loader: Loader<P>, opts: { loading?: () => ReactNode; ssr?: boolean } = {}) {
  const Lazy = lazy(async () => {
    const mod = await loader();
    return { default: "default" in mod ? mod.default : mod };
  });
  const Fallback = opts.loading;
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={Fallback ? <Fallback /> : null}>
        <Lazy {...(props as ComponentProps<typeof Lazy>)} />
      </Suspense>
    );
  };
}
