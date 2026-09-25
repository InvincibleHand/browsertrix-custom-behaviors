class GenericSlowLazyLoad {
  static id = "Generic Slow Scroll + Lazy Load";

  static isMatch() {
    /*
     * 범용으로 모든 페이지에서 실행하려면 true.
     *
     * 단, 아래 설명처럼 YouTube, Instagram 등의 Browsertrix
     * 전용 site-specific behavior와 충돌할 수 있으므로
     * 범용 아카이빙용 Workflow에서 사용하는 것을 권장합니다.
     */

    const host = window.location.hostname.toLowerCase();

    // Browsertrix 자체 site-specific behavior를 사용하는 사이트는 제외
    const excludedHosts = [
      "youtube.com",
      "www.youtube.com",
      "instagram.com",
      "www.instagram.com",
      "facebook.com",
      "www.facebook.com",
      "x.com",
      "twitter.com",
      "www.twitter.com",
      "tiktok.com",
      "www.tiktok.com",
      "telegram.org",
      "web.telegram.org",
      "bsky.app"
    ];

    if (
      excludedHosts.some(
        h => host === h || host.endsWith("." + h)
      )
    ) {
      return false;
    }

    return true;
  }

  static init() {
    return {
      state: {
        steps: 0,
        activatedImages: 0,
        activatedSrcsets: 0,
        activatedBackgrounds: 0
      }
    };
  }

  static runInIframe = false;

  async *run(ctx) {
    const { sleep, getState } = ctx.Lib;

    /*
     * ================================
     * 사용자가 조절할 주요 설정
     * ================================
     */

    // 한 번에 화면 높이의 몇 %씩 이동할 것인지
    const SCROLL_STEP_RATIO = 0.70;

    // 한 번 스크롤한 뒤 페이지 JS가 반응할 시간
    const SCROLL_SETTLE_MS = 1500;

    // 현재 화면 주변 이미지의 load/error를 기다리는 최대 시간
    const IMAGE_WAIT_MS = 4000;

    // 한 단계 처리가 끝난 뒤 추가 휴식
    const AFTER_STEP_MS = 500;

    // 페이지 끝에 도착했을 때 추가 콘텐츠가 붙는지 기다리는 시간
    const BOTTOM_WAIT_MS = 5000;

    // 페이지 높이가 이 횟수만큼 연속해서 변하지 않으면 종료
    const STABLE_BOTTOM_ROUNDS = 3;

    // 무한 스크롤 사이트에서 영원히 돌지 않도록 제한
    const MAX_SCROLL_STEPS = 250;

    // 마지막 요청들을 마무리할 시간
    const FINAL_WAIT_MS = 10000;

    /*
     * 표준/자주 쓰이는 lazy-load 속성을 강제로 활성화할지 여부.
     *
     * true:
     *   data-src, data-original, data-lazy-src, file 등을 보조 처리
     *
     * false:
     *   DOM을 건드리지 않고 천천히 스크롤만 함
     */
    const FORCE_KNOWN_LAZY_ATTRS = true;


    // ------------------------------------------------
    // URL 유효성 검사 / 상대 URL → 절대 URL 변환
    // ------------------------------------------------

    const normalizeUrl = (raw) => {
      if (!raw) return null;

      raw = raw.trim();

      if (
        raw.startsWith("javascript:") ||
        raw.startsWith("blob:")
      ) {
        return null;
      }

      try {
        return new URL(raw, window.location.href).href;
      } catch {
        return null;
      }
    };


    // ------------------------------------------------
    // 화면 근처에 있는 요소인지 검사
    // ------------------------------------------------

    const isNearViewport = (elem) => {
      const rect = elem.getBoundingClientRect();

      // 화면 위/아래 약 1 viewport 정도까지 미리 처리
      return (
        rect.bottom >= -window.innerHeight &&
        rect.top <= window.innerHeight * 2
      );
    };


    // ------------------------------------------------
    // lazy 이미지 활성화
    // ------------------------------------------------

    const activateLazyResources = () => {
      if (!FORCE_KNOWN_LAZY_ATTRS) {
        return;
      }

      const imgs = document.querySelectorAll("img");

      for (const img of imgs) {
        if (!isNearViewport(img)) {
          continue;
        }

        // 브라우저 자체 native lazy loading도 현재 영역에서는 eager 처리
        if (img.getAttribute("loading") === "lazy") {
          img.setAttribute("loading", "eager");
        }

        /*
         * 자주 사용하는 lazy-image 실제 URL 속성.
         *
         * file은 Discuz 등 일부 구형 사이트 호환용.
         */
        const candidateAttrs = [
          "data-src",
          "data-original",
          "data-lazy-src",
          "data-image",
          "file"
        ];

        let candidate = null;

        for (const attr of candidateAttrs) {
          const value = img.getAttribute(attr);

          if (value) {
            candidate = normalizeUrl(value);

            if (candidate) {
              break;
            }
          }
        }

        if (candidate) {
          const currentSrc = img.getAttribute("src");

          /*
           * lazy 전용 URL이 명확히 존재하면 실제 URL을 사용.
           *
           * placeholder GIF/빈 src 등의 경우에도 작동.
           */
          if (!currentSrc || normalizeUrl(currentSrc) !== candidate) {
            img.setAttribute("src", candidate);
            ctx.state.activatedImages++;
          }
        }


        // data-srcset / data-lazy-srcset 지원
        const lazySrcset =
          img.getAttribute("data-srcset") ||
          img.getAttribute("data-lazy-srcset");

        if (
          lazySrcset &&
          img.getAttribute("srcset") !== lazySrcset
        ) {
          img.setAttribute("srcset", lazySrcset);
          ctx.state.activatedSrcsets++;
        }
      }


      // <picture><source data-srcset="..."> 지원
      const sources =
        document.querySelectorAll(
          "source[data-srcset], source[data-lazy-srcset]"
        );

      for (const source of sources) {
        if (!isNearViewport(source.parentElement || source)) {
          continue;
        }

        const value =
          source.getAttribute("data-srcset") ||
          source.getAttribute("data-lazy-srcset");

        if (
          value &&
          source.getAttribute("srcset") !== value
        ) {
          source.setAttribute("srcset", value);
          ctx.state.activatedSrcsets++;
        }
      }


      /*
       * 일부 사이트의 lazy background image 지원.
       *
       * 예:
       * data-bg="/image.jpg"
       * data-background-image="/image.jpg"
       */
      const backgrounds =
        document.querySelectorAll(
          "[data-bg], [data-background-image]"
        );

      for (const elem of backgrounds) {
        if (!isNearViewport(elem)) {
          continue;
        }

        const raw =
          elem.getAttribute("data-bg") ||
          elem.getAttribute("data-background-image");

        const url = normalizeUrl(raw);

        if (url) {
          const expected = `url("${url}")`;

          if (elem.style.backgroundImage !== expected) {
            elem.style.backgroundImage = expected;
            ctx.state.activatedBackgrounds++;
          }
        }
      }
    };


    // ------------------------------------------------
    // 현재 viewport 주변 이미지가 끝날 때까지 잠시 기다림
    // ------------------------------------------------

    const waitForNearbyImages = async () => {
      const pending = Array.from(
        document.querySelectorAll("img")
      ).filter(img => {
        return (
          isNearViewport(img) &&
          img.getAttribute("src") &&
          !img.complete
        );
      });

      if (!pending.length) {
        return;
      }

      const waitOne = (img) =>
        new Promise(resolve => {
          let finished = false;

          const done = () => {
            if (finished) return;
            finished = true;

            img.removeEventListener("load", done);
            img.removeEventListener("error", done);

            clearTimeout(timer);
            resolve();
          };

          img.addEventListener("load", done, {
            once: true
          });

          img.addEventListener("error", done, {
            once: true
          });

          const timer = setTimeout(
            done,
            IMAGE_WAIT_MS
          );
        });

      /*
       * 이미지들을 병렬로 기다리므로
       * 20장 × 4초처럼 누적되는 것이 아니라
       * 전체적으로 최대 IMAGE_WAIT_MS 정도 기다림.
       */
      await Promise.all(
        pending.map(img => waitOne(img))
      );
    };


    // ------------------------------------------------
    // 시작
    // ------------------------------------------------

    window.scrollTo({
      top: 0,
      behavior: "auto"
    });

    await sleep(1000);

    yield getState(
      ctx,
      "Starting generic slow-scroll behavior"
    );

    let stableBottomCount = 0;

    for (
      let step = 0;
      step < MAX_SCROLL_STEPS;
      step++
    ) {
      ctx.state.steps = step + 1;

      const beforeHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0
      );

      const viewportHeight =
        Math.max(window.innerHeight, 1);

      const currentY = window.scrollY;

      const maxY = Math.max(
        0,
        beforeHeight - viewportHeight
      );

      const nextY = Math.min(
        maxY,
        currentY +
          Math.floor(
            viewportHeight *
            SCROLL_STEP_RATIO
          )
      );


      // 사람처럼 조금씩 아래로 이동
      window.scrollTo({
        top: nextY,
        behavior: "smooth"
      });

      // IntersectionObserver / scroll event 등이 반응하도록 대기
      await sleep(SCROLL_SETTLE_MS);


      // 표준 lazy resource들을 보조 활성화
      activateLazyResources();


      // 현재 영역의 이미지 요청이 끝나는 것을 기다림
      await waitForNearbyImages();

      await sleep(AFTER_STEP_MS);


      const afterHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0
      );


      const nearBottom =
        window.scrollY + viewportHeight >=
        afterHeight - 10;


      if (nearBottom) {
        /*
         * infinite scroll / AJAX pagination 등의
         * 새로운 DOM이 추가될 시간을 줌
         */
        await sleep(BOTTOM_WAIT_MS);

        activateLazyResources();

        await waitForNearbyImages();

        const finalHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight || 0
        );


        // 새로운 콘텐츠가 붙었는지 확인
        if (finalHeight > afterHeight + 10) {
          stableBottomCount = 0;
        } else {
          stableBottomCount++;
        }


        if (
          stableBottomCount >=
          STABLE_BOTTOM_ROUNDS
        ) {
          break;
        }
      } else {
        stableBottomCount = 0;
      }


      if ((step + 1) % 10 === 0) {
        yield {
          msg:
            `Slow scroll step ${step + 1}; ` +
            `images=${ctx.state.activatedImages}, ` +
            `srcsets=${ctx.state.activatedSrcsets}, ` +
            `backgrounds=${ctx.state.activatedBackgrounds}`
        };
      }
    }


    // 마지막 처리
    activateLazyResources();

    await waitForNearbyImages();

    await sleep(FINAL_WAIT_MS);


    yield {
      msg:
        `Generic lazy-load behavior finished. ` +
        `steps=${ctx.state.steps}, ` +
        `images=${ctx.state.activatedImages}, ` +
        `srcsets=${ctx.state.activatedSrcsets}, ` +
        `backgrounds=${ctx.state.activatedBackgrounds}`
    };
  }
}
