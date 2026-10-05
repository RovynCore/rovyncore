"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";

type ScrollRevealOptions = {
  delay?: number;
  once?: boolean;
};

type ScrollRevealStyle = CSSProperties & {
  "--reveal-delay": string;
};

type ScrollRevealState<T extends HTMLElement> = readonly [
  ref: RefCallback<T>,
  className: string,
  style: ScrollRevealStyle,
];

/** Adds a one-time viewport entrance without changing the element's layout role. */
export function useScrollReveal<T extends HTMLElement = HTMLElement>(
  options: ScrollRevealOptions = {},
): ScrollRevealState<T> {
  const { delay = 0, once = true } = options;
  const elementRef = useRef<T | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useCallback<RefCallback<T>>((element) => {
    elementRef.current = element;
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setReady(true);
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [once]);

  return [
    ref,
    [
      "scroll-reveal",
      ready && "scroll-reveal--ready",
      visible && "scroll-reveal--visible",
    ]
      .filter(Boolean)
      .join(" "),
    { "--reveal-delay": `${delay}ms` },
  ];
}
