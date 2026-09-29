import { createRolodex, createSource } from "../src/rolodex.js";

/**
 * Example only.
 *
 * "api" is the host extension's own Cloudflare client. Rolodex.js never owns
 * credentials and never talks directly to Cloudflare unless the host adapter
 * explicitly chooses to do so.
 */
export function createR2RolodexSource(api) {
  return createSource({
    async getRoot(context) {
      const buckets = await api.listBuckets();

      return buckets.map(bucket => ({
        id: `bucket:${bucket.name}`,
        title: bucket.name,
        kind: "bucket",
        hasChildren: true,
        meta: {
          bucket: bucket.name
        }
      }));
    },

    async getChildren(node, context) {
      if (node.kind !== "bucket" && node.kind !== "prefix") return [];

      const bucket = node.meta.bucket;
      const prefix = node.meta.prefix ?? "";
      const listing = await api.listObjects({
        bucket,
        prefix,
        delimiter: "/"
      });

      const prefixes = (listing.prefixes ?? []).map(childPrefix => ({
        id: `prefix:${bucket}:${childPrefix}`,
        title: childPrefix.split("/").filter(Boolean).at(-1) ?? childPrefix,
        kind: "prefix",
        hasChildren: true,
        meta: {
          bucket,
          prefix: childPrefix
        }
      }));

      const objects = (listing.objects ?? []).map(object => ({
        id: `object:${bucket}:${object.key}`,
        title: object.key.split("/").at(-1) ?? object.key,
        kind: "object",
        hasChildren: false,
        meta: {
          bucket,
          key: object.key,
          size: object.size,
          etag: object.etag
        }
      }));

      return [...prefixes, ...objects];
    },

    async search(query, context) {
      return api.searchObjects({
        query,
        intent: context?.intent
      });
    },

    capabilities(context) {
      return {
        read: true,
        search: true,
        lazyLoading: true,
        move: true,
        copy: true,
        rename: true
      };
    }
  });
}

export function createR2Rolodex(api, {
  intent = "move",
  selection = []
} = {}) {
  return createRolodex({
    source: createR2RolodexSource(api),
    maxDepth: 100,
    context: {
      intent,
      selection
    }
  });
}
