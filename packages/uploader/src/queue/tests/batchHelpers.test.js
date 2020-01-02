import { UPLOADER_EVENTS } from "../../consts";
import getQueueState from "./mocks/getQueueState.mock";
import * as batchHelpers from "../batchHelpers";

describe("batchHelpers tests", () => {

	describe("isBatchFinished tests", () => {

		it("should be finished when no items in queue", () => {
			const queueState = getQueueState({
				itemQueue: []
			});

			expect(batchHelpers.isBatchFinished(queueState)).toBe(true);
		});

		it("should be finished when new batch is starting", () => {
			const queueState = getQueueState({
				currentBatch: "b1",
				itemQueue: ["u2"],
				items: {
					"u2": { batchId: "b2" }
				},
				batches: {
					"b2": { batch: { id: "b2" } }
				}
			});

			expect(batchHelpers.isBatchFinished(queueState)).toBe(true);
		});

		it("shouldn't be finished when items in queue part of same batch", () => {
			const queueState = getQueueState({
				currentBatch: "b1",
				itemQueue: ["u2"],
				items: {
					"u2": { batchId: "b1" }
				},
				batches: {
					"b1": { batch: { id: "b1" } }
				}
			});

			expect(batchHelpers.isBatchFinished(queueState)).toBe(false);
		});
	});

	describe("cleanUpFinishedBatch tests", () => {

		it("should finalize batch if no more uploads in queue", () => {

			const batch = {};

			const queueState = getQueueState({
				currentBatch: "b1",
				batches: {
					b1: { batch },
				},
			});

			batchHelpers.cleanUpFinishedBatch(queueState);

			expect(queueState.updateState).toHaveBeenCalledTimes(1);
			expect(queueState.state.batches.b1).toBeUndefined();
			expect(queueState.trigger).toHaveBeenCalledWith(UPLOADER_EVENTS.BATCH_FINISH, batch);
		});

		it("should finalize batch if next upload is from different batch", () => {

			const batch = {};

			const queueState = getQueueState({
				currentBatch: "b1",
				batches: {
					b1: { batch },
					b2: {
						batch: { id: "b2" },
					}
				},
				items: {
					"u2": { batchId: "b2" }
				},
				itemQueue: ["u2"]
			});

			batchHelpers.cleanUpFinishedBatch(queueState);

			expect(queueState.updateState).toHaveBeenCalledTimes(1);
			expect(queueState.state.batches.b1).toBeUndefined();
			expect(queueState.trigger).toHaveBeenCalledWith(UPLOADER_EVENTS.BATCH_FINISH, batch);
		});

		it("shouldn't finalize batch if it has more uploads", () => {
			const batch = { id: "b1" };

			const queueState = getQueueState({
				currentBatch: "b1",
				batches: {
					b1: { batch },
					b2: {
						batch: { id: "b2" },
					}
				},
				items: {
					"u2": { batchId: "b1" },
					"u3": { batchId: "b2" },
				},
				itemQueue: ["u2", "u3"]
			});

			batchHelpers.cleanUpFinishedBatch(queueState);

			expect(queueState.updateState).not.toHaveBeenCalled();
			expect(queueState.state.batches.b1).toBeDefined();
			expect(queueState.trigger).not.toHaveBeenCalledWith(UPLOADER_EVENTS.BATCH_FINISH, batch);
		});

	});

	describe("loadNewBatchForItem tests", () => {
		it("should load allowed batch", async () => {
			const queueState = getQueueState({
				currentBatch: null,
				batches: {
					"b1": { batch: { id: "b1" }, batchOptions: {} },
				},
				items: {
					"u1": { batchId: "b1" }
				}
			});

			const allowed = await batchHelpers.loadNewBatchForItem(queueState, "u1");

			expect(allowed).toBe(true);

			expect(queueState.cancellable).toHaveBeenCalledWith(
				UPLOADER_EVENTS.BATCH_START, queueState.state.batches.b1.batch);

			expect(queueState.state.currentBatch).toBe("b1");
		});

		it("should cancel batch", async () => {

			const queueState = getQueueState({
				currentBatch: "b1",
				batches: {
					"b2": { batch: { id: "b2" }, batchOptions: {} },
				},
				items: {
					"u2": { batchId: "b2" }
				}
			});

			queueState.cancellable.mockResolvedValueOnce(true);
			const allowed = await batchHelpers.loadNewBatchForItem(queueState, "u2");

			expect(allowed).toBe(false);

			expect(queueState.cancellable).toHaveBeenCalledWith(
				UPLOADER_EVENTS.BATCH_START, queueState.state.batches.b2.batch);

			expect(queueState.state.currentBatch).toBe("b1");
		});
	});

	describe("isNewBatchStarting tests", () => {
		it("should return true for new batch", () => {

			const queueState = getQueueState({
				currentBatch: "b1",
				batches: {
					"b2": { batch: { id: "b2" } },
				},
				items: {
					"u2": { batchId: "b2" }
				}
			});

			const result = batchHelpers.isNewBatchStarting(queueState, "u2");

			expect(result).toBe(true);
		});

		it("should return false for same batch", () => {

			const queueState = getQueueState({
				currentBatch: "b1",
				batches: {
					"b1": { batch: { id: "b1" } },
				},
				items: {
					"u2": { batchId: "b1" }
				}
			});

			const result = batchHelpers.isNewBatchStarting(queueState, "u2");

			expect(result).toBe(false);
		});
	});

	describe("cancelBatchForItem tests", () => {
		it("should cancel batch, remove items and batch from state", () => {

			const ids = ["u1", "u2", "u3"];
			const items = ids.reduce((res, id) =>
				({ ...res, [id]: { id, batchId: "b1" } }), {});

			const cancelledBatch = { id: "b1", items: Object.values(items) };

			const queueState = getQueueState({
				items: {
					...items,
					"u4": { id: "u4", batchId: "b2" },
				},
				batches: {
					"b1": { batch: cancelledBatch, },
					"b2": {}
				},
				itemQueue: [...ids, "u4"],
			});

			batchHelpers.cancelBatchForItem(queueState, "u1");

			expect(queueState.trigger).toHaveBeenCalledWith(
				UPLOADER_EVENTS.BATCH_CANCEL,
				cancelledBatch,
			);

			expect(queueState.state.batches.b1).toBeUndefined();
			expect(queueState.state.batches.b2).toBeDefined();

			expect(queueState.state.itemQueue).toEqual(["u4"]);

			expect(queueState.state.items).toEqual({
				"u4": { id: "u4", batchId: "b2" },
			});
		});
	});

	describe("getBatchFromItemId tests", () => {
		it("should return correct batch", () => {

			const batch = { id: "b2" };

			const queueState = getQueueState({
				items: {
					u1: { batchId: "b1" },
					u2: { batchId: "b2" },
				},
				batches: {
					b1: { batch: {} },
					b2: { batch, }
				}
			});

			const result = batchHelpers.getBatchFromItemId(queueState, "u2");

			expect(result).toBe(batch);
		});
	});

	describe("getBatchDataFromItemId tests", () => {
		it("should return correct batch data", () => {
			const batch = { id: "b2" },
				batchOptions = {};

			const queueState = getQueueState({
				items: {
					u1: { batchId: "b1" },
					u2: { batchId: "b2" },
				},
				batches: {
					b1: { batch: {} },
					b2: { batch, batchOptions}
				}
			});

			const result = batchHelpers.getBatchDataFromItemId(queueState, "u2");

			expect(result.batch).toBe(batch);
			expect(result.batchOptions).toBe(batchOptions);
		});
	});

	describe("isItemBelongsToBatch tests", () => {
		it.each([
			["b2", true],
			["b1", false]
		])("for %s should return %s", (bId, expected) => {

			const queueState = getQueueState({
				items: {
					u1: { batchId: "b1" },
					u2: { batchId: "b2" },
				},
			});

			const result = batchHelpers.isItemBelongsToBatch(queueState, "u2", bId);

			expect(result).toBe(expected);
		});

	});
});
