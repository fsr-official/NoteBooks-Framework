import "server-only";

import {
  isMdxRenderingEnabled,
  isRepositoryMdxRenderingEnabled,
} from "@/lib/mdx-feature-flag";
import { servePublicContent } from "@/lib/public-content-route";
import {
  C2_FIXTURE_ROUTE,
  c2FixtureReadRouteDataProvider,
} from "@/lib/read-route-fixture";

export interface ReadRouteIdentity {
  owner: string;
  repository: string;
  path: string;
  branch: string;
}

export interface ReadRouteDataProvider {
  readonly kind: "production" | "fixture";
  isMdxRenderingEnabled(identity: ReadRouteIdentity): Promise<boolean>;
  servePublicContent(request: Request, identity: ReadRouteIdentity): Promise<Response>;
}

const productionReadRouteDataProvider: ReadRouteDataProvider = {
  kind: "production",
  async isMdxRenderingEnabled({ owner, repository }) {
    return await isMdxRenderingEnabled()
      && await isRepositoryMdxRenderingEnabled(owner, repository);
  },
  servePublicContent(request) {
    return servePublicContent(request, "markdown");
  },
};

function isLocalNonProductionEnvironment(environment: NodeJS.ProcessEnv): boolean {
  return environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
}

function isC2FixtureRoute(identity: ReadRouteIdentity): boolean {
  return identity.owner === C2_FIXTURE_ROUTE.owner
    && identity.repository === C2_FIXTURE_ROUTE.repository
    && identity.path === C2_FIXTURE_ROUTE.path
    && identity.branch === C2_FIXTURE_ROUTE.branch;
}

export function getReadRouteDataProvider(
  identity: ReadRouteIdentity,
  environment: NodeJS.ProcessEnv = process.env,
): ReadRouteDataProvider {
  if (
    isLocalNonProductionEnvironment(environment)
    && environment.NOTEBOOKS_C2_FIXTURE === "1"
    && isC2FixtureRoute(identity)
  ) {
    return c2FixtureReadRouteDataProvider;
  }
  return productionReadRouteDataProvider;
}
