import React from "react";
import { render, screen } from "@testing-library/react";
import DuelView from "../DuelView";
import { ELIMINATION_THRESHOLD } from "../../constants/constants";

const players = [
  { socketId: "a", name: "Alice", avatar: "🐱" },
  { socketId: "b", name: "Bob", avatar: "🐶" },
  { socketId: "c", name: "Charlie", avatar: "🦊" },
];

describe("DuelView", () => {
  test("renders the duel header and rule reminder", () => {
    render(
      <DuelView players={players} points={{}} eliminatedPlayers={["c"]} mySocketId="a">
        <div data-testid="children" />
      </DuelView>
    );
    expect(screen.getByText("⚔️ 1v1 Duel")).toBeInTheDocument();
    expect(screen.getByText("100 beats 0")).toBeInTheDocument();
    expect(screen.getByText("0 beats 1")).toBeInTheDocument();
    expect(screen.getByText("1 beats 100")).toBeInTheDocument();
    expect(screen.getByText("VS")).toBeInTheDocument();
  });

  test("shows opponent on the left and 'YOU' on the right when participating", () => {
    render(
      <DuelView players={players} points={{ a: 2, b: 3 }} eliminatedPlayers={["c"]} mySocketId="a">
        <div data-testid="children" />
      </DuelView>
    );
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("YOU")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText(`/${ELIMINATION_THRESHOLD}`)).toHaveLength(2);
  });

  test("renders both active players without YOU label when observer", () => {
    render(
      <DuelView players={players} points={{}} eliminatedPlayers={["a"]} mySocketId="a">
        <div data-testid="children" />
      </DuelView>
    );
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("YOU")).not.toBeInTheDocument();
  });

  test("defaults missing points to 0", () => {
    render(
      <DuelView players={players} points={{}} eliminatedPlayers={["c"]} mySocketId="a">
        <div data-testid="children" />
      </DuelView>
    );
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  test("shows danger zone warning when points are at the elimination threshold minus one", () => {
    render(
      <DuelView
        players={players}
        points={{ a: ELIMINATION_THRESHOLD - 1, b: 0 }}
        eliminatedPlayers={["c"]}
        mySocketId="a"
      >
        <div data-testid="children" />
      </DuelView>
    );
    expect(screen.getByText("⚠️ Danger zone!")).toBeInTheDocument();
  });

  test("renders a placeholder card when a player slot is missing", () => {
    render(
      <DuelView players={[players[0]]} points={{}} eliminatedPlayers={[]} mySocketId="a">
        <div data-testid="children" />
      </DuelView>
    );
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  test("renders children passed in", () => {
    render(
      <DuelView players={players} points={{}} eliminatedPlayers={["c"]} mySocketId="a">
        <div data-testid="children">number input</div>
      </DuelView>
    );
    expect(screen.getByTestId("children")).toBeInTheDocument();
  });

  test("renders gracefully with empty players array", () => {
    render(
      <DuelView players={[]} points={{}} eliminatedPlayers={[]} mySocketId="a">
        <div data-testid="children" />
      </DuelView>
    );
    expect(screen.getAllByText("?")).toHaveLength(2);
  });
});
