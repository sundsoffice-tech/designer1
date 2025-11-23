import { I18nextProvider } from "react-i18next";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LanguageSwitcher from "../src/components/LanguageSwitcher";
import i18n from "../src/i18n";

const renderWithProvider = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <LanguageSwitcher />
    </I18nextProvider>
  );

describe("LanguageSwitcher", () => {
  beforeEach(async () => {
    localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage("de");
    });
  });

  it("shows the active language and opens the menu", async () => {
    renderWithProvider();
    const user = userEvent.setup();

    const toggle = screen.getByRole("button", { name: /sprache wechseln/i });
    expect(toggle).toBeInTheDocument();
    expect(screen.getAllByText("DE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Deutsch")).toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByRole("button", { name: /EN English/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /FR Francais/i })).toBeInTheDocument();
  });

  it("changes the language, updates labels, and closes the menu", async () => {
    renderWithProvider();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /sprache wechseln/i }));
    await user.click(screen.getByRole("button", { name: /EN English/i }));

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
    });

    expect(screen.getAllByText("EN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /FR Francais/i })).not.toBeInTheDocument();
  });
});
