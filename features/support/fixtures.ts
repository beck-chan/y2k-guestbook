import type { TestInfo } from "@playwright/test";
import { createBdd, test as base } from "playwright-bdd";
import { closeBrowsers, finishScenario, prepareScenario } from "./hooks";
import { PlaywrightWorld } from "./world";

export const test = base.extend<
  { world: PlaywrightWorld },
  { closeGuestbookBrowsers: void }
>({
  closeGuestbookBrowsers: [
    async ({}, use) => {
      await use();
      await closeBrowsers();
    },
    { scope: "worker", auto: true },
  ],
  world: async ({}, use, testInfo: TestInfo) => {
    const world = new PlaywrightWorld();
    world.scenarioName = testInfo.title;
    await prepareScenario(world, testInfo.file);
    try {
      await use(world);
    } finally {
      await finishScenario(world, testInfo.file, testInfo);
    }
  },
});

export const { Given, When, Then } = createBdd(test, {
  worldFixture: "world",
});
