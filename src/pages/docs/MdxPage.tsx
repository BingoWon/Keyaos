import type { ComponentType } from "react";
import { mdxComponents, useScrollToHash } from "./MdxComponents";

/**
 * Wraps an MDX page component with the shared component overrides.
 * Usage in router: `element: <MdxPage component={lazy(() => import("./quickstart.mdx"))} />`
 */
export function MdxPage({ Component }: { Component: ComponentType }) {
	useScrollToHash();
	return <Component components={mdxComponents} />;
}
