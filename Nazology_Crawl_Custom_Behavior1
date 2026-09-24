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

  async* run(ctx) {
    const match = window.location.pathname.match(
      /^\/archives\/(\d+)(?:\/\d+)?\/?$/
    );

    if (!match) {
      return;
    }

    const articleId = match[1];

    // 현재 기사와 같은 ID를 가진 페이지 링크만 허용
    const pagePattern = new RegExp(
      `^/archives/${articleId}/(?:[2-9]|[1-9]\\d+)/?$`
    );

    const foundPages = new Set();

    // 페이지 안의 모든 링크 검사
    for (const anchor of document.querySelectorAll("a[href]")) {
      let url;

      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        continue;
      }

      // Nazology 내부 링크만
      if (url.hostname !== "nazology.kusuguru.co.jp") {
        continue;
      }

      // 현재 기사 ID와 같은 /2, /3, /4... 만
      if (!pagePattern.test(url.pathname)) {
        continue;
      }

      // 추적용 query/hash가 있다면 제거
      url.search = "";
      url.hash = "";

      foundPages.add(url.href);
    }

    // 발견한 후속 페이지를 Browsertrix crawl queue에 추가
    for (const url of foundPages) {
      await ctx.Lib.addLink(url);

      yield ctx.Lib.getState(
        ctx,
        `Queued Nazology article page: ${url}`,
        "queuedPages"
      );
    }

    // Custom Behavior 사용 시 기사 이미지의 lazy-loading도
    // 잘 이루어지도록 페이지를 천천히 아래까지 스크롤
    let previousHeight = 0;

    for (let i = 0; i < 60; i++) {
      const currentHeight = document.documentElement.scrollHeight;

      window.scrollBy(
        0,
        Math.max(window.innerHeight * 0.8, 600)
      );

      await ctx.Lib.sleep(700);

      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 10;

      if (atBottom && currentHeight === previousHeight) {
        break;
      }

      previousHeight = currentHeight;
    }

    // 마지막 lazy-load 리소스를 위한 약간의 대기
    await ctx.Lib.sleep(1500);

    window.scrollTo(0, 0);

    yield ctx.Lib.getState(
      ctx,
      `Finished Nazology article ${articleId}`,
      "finished"
    );
  }
}
