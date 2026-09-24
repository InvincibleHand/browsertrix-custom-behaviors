class NazologyMultiPageArticle {
  static id = "Nazology Multi-Page Article";

  static isMatch() {
    return (
      window.location.hostname === "nazology.kusuguru.co.jp" &&
      /^\/archives\/\d+(?:\/\d+)?\/?$/.test(window.location.pathname)
    );
  }

  static init() {
    return {};
  }

  static runInIframe = false;

  async* run(ctx) {
    const { addLink, getState, sleep } = ctx.Lib;

    yield getState(
      ctx,
      `Nazology behavior START: ${window.location.href}`,
      "started"
    );

    const match = window.location.pathname.match(
      /^\/archives\/(\d+)(?:\/\d+)?\/?$/
    );

    if (!match) {
      yield getState(ctx, "No article ID matched", "errors");
      return;
    }

    const articleId = match[1];

    const foundPages = new Set();

    for (const a of document.querySelectorAll("a[href]")) {
      let url;

      try {
        url = new URL(a.href, window.location.href);
      } catch {
        continue;
      }

      if (url.hostname !== "nazology.kusuguru.co.jp") {
        continue;
      }

      const pageMatch = url.pathname.match(
        new RegExp(`^/archives/${articleId}/([0-9]+)/?$`)
      );

      if (!pageMatch) {
        continue;
      }

      const pageNumber = Number(pageMatch[1]);

      if (!Number.isInteger(pageNumber) || pageNumber < 2) {
        continue;
      }

      url.search = "";
      url.hash = "";

      foundPages.add(url.href);
    }

    yield getState(
      ctx,
      `Found ${foundPages.size} additional pages for article ${articleId}`,
      "scanned"
    );

    for (const url of foundPages) {
      await addLink(url);

      yield getState(
        ctx,
        `ADD LINK: ${url}`,
        "queued"
      );
    }

    // 이미지 lazy-loading용 천천히 스크롤
    let lastHeight = 0;

    for (let i = 0; i < 60; i++) {
      window.scrollBy(0, Math.max(window.innerHeight * 0.8, 600));

      await sleep(700);

      const height = document.documentElement.scrollHeight;
      const atBottom =
        window.scrollY + window.innerHeight >= height - 20;

      if (atBottom && height === lastHeight) {
        break;
      }

      lastHeight = height;
    }

    await sleep(1000);

    window.scrollTo(0, 0);

    yield getState(
      ctx,
      `Nazology behavior DONE: ${articleId}`,
      "finished"
    );
  }
}
