// @ts-check
/**
 * Host half of the usage-billing bundle.
 *
 * `apply` does no I/O of its own: it constructs the Remote service (which
 * registers `ctx.usageBilling` synchronously) and opens the storage domain
 * asynchronously. Opening, replay, backfill and price refresh all run off the
 * activation path, so a slow disk or a dead network never blocks startup.
 */

import { createDomainSpec } from './host/domain.js';
import { UsageBillingService } from './host/service.js';

/** Cordis plugin name (matches the row id prefix in `cordis.patch.yml`). */
export const name = 'usage-billing';

/** The storage-domain facility is the only hard dependency. */
export const inject = ['storageDomain'];

export function apply(ctx) {
  const service = new UsageBillingService(ctx);
  let disposed = false;
  let opening = false;
  let retry = 0;

  const open = async () => {
    if (disposed || opening) return;
    opening = true;
    let domain;
    try {
      domain = await ctx.storageDomain.open(await createDomainSpec());
      if (disposed) {
        await domain.close().catch(() => {});
        return;
      }
      await service.attach(domain);
      domain = undefined;
      retry = 0;
    } catch (error) {
      // A failed attach must not keep the name reserved: the next retry would
      // only ever see `already-open`.
      if (domain !== undefined) await domain.close().catch(() => {});
      if (disposed) return;
      const code = typeof error === 'object' && error !== null ? error.code : undefined;
      // A live HMR reload can race the previous instance's close, and a slow
      // ledger flush can stretch that close. Retry with a bounded backoff and
      // then keep a slow periodic retry, so the plugin heals itself instead of
      // serving an empty state forever.
      if (code === 'already-open') {
        retry += 1;
        if (retry <= 8) {
          setTimeout(() => { void open(); }, Math.min(4000, 200 * retry));
        } else {
          setTimeout(() => { void open(); }, 15000);
        }
        return;
      }
      ctx.logger.warn('[usage-billing] 存储域打开失败；用量计费降级为只读空状态', error);
    } finally {
      opening = false;
    }
  };

  ctx.effect(() => {
    void open();
    return () => {
      disposed = true;
      // Return the promise: Cordis awaits async disposers, so a following
      // instance does not race this one for the same domain name.
      return service.dispose();
    };
  });

  ctx.logger.debug?.('[usage-billing] host 已加载，等待存储域与历史回填');
}
