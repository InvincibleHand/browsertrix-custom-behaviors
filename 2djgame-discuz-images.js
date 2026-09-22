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

    // ===== 조절 가능한 값 =====

    // 해당 이미지 위치로 스크롤한 뒤
    // Discuz lazy-loader가 반응할 시간을 줌
    const SCROLL_SETTLE_MS = 1000;

    // src가 설정된 뒤 실제 이미지가 load/error 될 때까지
    // 이미지 하나당 최대로 기다리는 시간
    const IMAGE_WAIT_MS = 3000;

    // 각 이미지 처리 후 추가 대기
    const AFTER_IMAGE_MS = 500;

    // 10개마다 잠시 쉬어서 외부 서버/CDN에
    // 요청이 너무 몰리는 것을 완화
    const BATCH_PAUSE_MS = 1500;

    // 전체 이미지 처리가 끝난 뒤
    // 남아 있는 네트워크 요청을 기다리는 시간
    const FINAL_WAIT_MS = 10000;

    // ==========================

    const waitForImage = async (img, timeoutMs) => {
      if (img.complete) {
        return;
      }

      await new Promise((resolve) => {
        let timer;

        const done = () => {
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);

          if (timer) {
            clearTimeout(timer);
          }

          resolve();
        };

        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });

        timer = setTimeout(done, timeoutMs);
      });
    };

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

      // 이미지 위치로 실제 스크롤
      scrollIntoView(img);

      // 사이트 자체 lazy-loader가 작동할 시간을 줌
      await sleep(SCROLL_SETTLE_MS);

      const currentSrc = img.getAttribute("src");

      if (!currentSrc) {
        // Discuz가 아직 src를 넣지 않았다면 직접 활성화
        img.setAttribute("loading", "eager");
        img.setAttribute("src", fileUrl);

        ctx.state.activated++;
      } else {
        ctx.state.alreadyLoaded++;
      }

      // 실제 다운로드 성공 또는 실패를 기다림
      await waitForImage(img, IMAGE_WAIT_MS);

      // 브라우저/WARC 캡처 쪽에 약간의 추가 여유
      await sleep(AFTER_IMAGE_MS);

      // 10개마다 요청 속도를 잠시 늦춤
      if ((i + 1) % 10 === 0) {
        yield getState(
          ctx,
          `Processed ${i + 1}/${images.length} lazy images`
        );

        await sleep(BATCH_PAUSE_MS);
      }
    }

    // 마지막 영역까지 확실히 스크롤
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });

    await sleep(3000);

    // 마지막 이미지 요청들이 끝날 시간
    await sleep(FINAL_WAIT_MS);

    yield getState(
      ctx,
      `Finished. Found=${ctx.state.found}, Activated=${ctx.state.activated}, AlreadyLoaded=${ctx.state.alreadyLoaded}, Skipped=${ctx.state.skipped}`
    );
  }
}
