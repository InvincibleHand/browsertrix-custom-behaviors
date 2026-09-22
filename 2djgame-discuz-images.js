class TwoDJGameDiscuzImages {
  static id = "2DJGAME Discuz Lazy Images";

  static isMatch() {
    return (
      window.location.hostname === "bbs4.2djgame.net" &&
      window.location.pathname === "/home/forum.php" &&
      new URLSearchParams(window.location.search).get("mod") === "viewthread"
    );
  }

  static init() {
    return {
      state: {
        found: 0,
        activated: 0,
        alreadyLoaded: 0,
        skipped: 0,
      },
    };
  }

  async *run(ctx) {
    const { sleep, scrollIntoView, getState } = ctx.Lib;

    const images = Array.from(
      document.querySelectorAll("img[file]")
    );

    ctx.state.found = images.length;

    yield getState(
      ctx,
      `Found ${images.length} Discuz lazy images`
    );

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const fileUrl = img.getAttribute("file");

      if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
        ctx.state.skipped++;
        continue;
      }

      // 이미지 위치까지 실제로 스크롤
      scrollIntoView(img);

      // 사이트 자체 lazy loader가 동작할 시간을 줌
      await sleep(250);

      const currentSrc = img.getAttribute("src");

      if (!currentSrc) {
        // 아직 Discuz가 src를 설정하지 않았다면 직접 활성화
        img.setAttribute("loading", "eager");
        img.setAttribute("src", fileUrl);

        ctx.state.activated++;
      } else {
        ctx.state.alreadyLoaded++;
      }

      // 이미지 요청을 시작할 여유
      await sleep(400);

      if ((i + 1) % 10 === 0) {
        yield getState(
          ctx,
          `Processed ${i + 1}/${images.length} lazy images`
        );
      }
    }

    // 페이지 마지막까지 내려가 추가 scroll 이벤트 발생
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });

    await sleep(3000);

    // 남아 있는 이미지 요청이 완료될 시간을 확보
    await sleep(5000);

    yield getState(
      ctx,
      `Finished. Found=${ctx.state.found}, Activated=${ctx.state.activated}, AlreadyLoaded=${ctx.state.alreadyLoaded}, Skipped=${ctx.state.skipped}`
    );
  }
}