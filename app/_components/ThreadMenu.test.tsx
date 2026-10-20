import { createRef } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThreadMenu from "@/app/_components/ThreadMenu";
import { renderWithTheme } from "@/app/_components/testing";

const onReport = jest.fn();
const onBlock = jest.fn();
const onUnblock = jest.fn();
beforeEach(() => {
	onReport.mockReset();
	onBlock.mockReset();
	onUnblock.mockReset();
});
const props = { counterpartName: "Demo Host A", blockedByMe: false, disabled: false, triggerRef: createRef<HTMLButtonElement>(), onReport, onBlock, onUnblock };
const more = () => screen.getByRole("button", { name: "More" });

it("is a labelled menu button, closed at first", () => {
	renderWithTheme(<ThreadMenu {...props} />);
	expect(more()).toHaveAttribute("aria-haspopup", "menu");
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("offers Report and Block, and calls back on choice", async () => {
	renderWithTheme(<ThreadMenu {...props} />);
	await userEvent.click(more());
	expect(screen.getByRole("menuitem", { name: "Report conversation" })).toBeInTheDocument();
	await userEvent.click(screen.getByRole("menuitem", { name: "Block Demo Host A" }));
	expect(onBlock).toHaveBeenCalledTimes(1);
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	await userEvent.click(more());
	await userEvent.click(screen.getByRole("menuitem", { name: "Report conversation" }));
	expect(onReport).toHaveBeenCalledTimes(1);
});

it("offers Unblock instead of Block when you've blocked them", async () => {
	renderWithTheme(<ThreadMenu {...props} blockedByMe />);
	await userEvent.click(more());
	expect(screen.queryByRole("menuitem", { name: "Block Demo Host A" })).not.toBeInTheDocument();
	await userEvent.click(screen.getByRole("menuitem", { name: "Unblock Demo Host A" }));
	expect(onUnblock).toHaveBeenCalledTimes(1);
});

it("Escape closes the menu and returns focus to More", async () => {
	renderWithTheme(<ThreadMenu {...props} />);
	await userEvent.click(more());
	await userEvent.keyboard("{Escape}");
	expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	expect(more()).toHaveFocus();
});

it("exposes the trigger through triggerRef, and can be disabled", () => {
	const triggerRef = createRef<HTMLButtonElement>();
	renderWithTheme(<ThreadMenu {...props} triggerRef={triggerRef} disabled />);
	expect(triggerRef.current).toBe(more());
	expect(more()).toBeDisabled();
});
