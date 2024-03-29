import React from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { NftCard } from "../../lib/components/NftCard/NftCard";
import styles from "./root.module.scss";
import {
  Alert,
  Backdrop,
  Button,
  CircularProgress,
  Paper,
  Typography,
  Unstable_Grid2,
} from "@mui/material";
import type { NFT } from "opensea-js";
import { create } from "mutative";
import {
  Cart_Q_Key,
  Opensea_Q_Key,
  getCart_Fn,
  getCart_Key,
  getOpenseaNfts_Fn,
  updateCart_Fn,
} from "./query";
import {
  combineNftandCollectionID,
  reduceCartItem,
  reduceNftToID,
} from "../../lib/utils/nft";
import { ShoppingCart } from "../../lib/components/ShoppingCart/ShoppingCart";
import type { T_Cart } from "../../lib/trpc/router/cart/cart.interface";
import { LoadingButton } from "@mui/lab";
import { NftDetailModal } from "../../lib/components/NftDetailModal/NftDetailModal";
import { useUserId } from "../../lib/utils/routing";
import { createFilenameLogger } from "../../lib/logger";
import { withFallback } from "vike-react-query";

const logger = createFilenameLogger(import.meta.url);

interface I_ImageComponent_Props {
  nft: NFT;
  in_cart: boolean;
  onNftCardClick: (nft: NFT) => void;
  onRemoveNft: (nft: NFT) => void;
}
const ImageComponent = React.memo<I_ImageComponent_Props>(
  function ImageComponent({ nft, in_cart, onNftCardClick, onRemoveNft }) {
    return (
      <Unstable_Grid2
        xs={12}
        sm={6}
        md={4}
        lg={3}
        key={reduceNftToID(nft)}
        className={styles.grid_card}
      >
        <NftCard
          nft={nft}
          in_cart={in_cart}
          onClick={onNftCardClick}
          onRemove={onRemoveNft}
        />
      </Unstable_Grid2>
    );
  }
);

export const ShoppingPage = withFallback(
  () => {
    const user_id = useUserId();
    const query_client = useQueryClient();

    const { data: opensea_results_map } = useSuspenseQuery({
      queryKey: [Opensea_Q_Key],
      queryFn: getOpenseaNfts_Fn,
    });
    const { data: shopping_cart_map } = useSuspenseQuery({
      queryKey: getCart_Key(user_id),
      queryFn: getCart_Fn,
    });

    const { mutate: updateCart } = useMutation({
      mutationFn: updateCart_Fn,
      onSuccess: () =>
        query_client.invalidateQueries({
          queryKey: [Cart_Q_Key],
        }),
    });

    const { mutate: onRefresh, isPending: is_refetching } = useMutation({
      mutationFn: async (): Promise<void> => {
        logger.debug("Refreshing data");
        await query_client.invalidateQueries();
      },
    });

    const [selected_nft, setSelectedNft] = React.useState<NFT | undefined>(
      undefined
    );

    const onNftCardClick = React.useCallback((clicked_nft: NFT) => {
      setSelectedNft(clicked_nft);
    }, []);

    const onRemove = React.useCallback(
      (combined_id: string) => {
        logger.debug({ combined_id }, "Removing item from cart");

        const shopping_cart_map = query_client.getQueryData<
          Map<string, T_Cart>
        >(getCart_Key(user_id));

        if (!shopping_cart_map) return;

        const updated_map = create(shopping_cart_map, (draft) => {
          draft.delete(combined_id);
        });

        updateCart({
          user_id,
          cart: Array.from(updated_map.values()),
        });
      },
      [query_client, updateCart, user_id]
    );

    const onRemoveNft = React.useCallback(
      (nft: NFT) => {
        onRemove(reduceNftToID(nft));
      },
      [onRemove]
    );
    const onRemoveCartItem = React.useCallback(
      (cart_item: T_Cart) => {
        onRemove(reduceCartItem(cart_item));
      },
      [onRemove]
    );

    const addNftToCart = React.useCallback(
      (nft: NFT) => {
        logger.debug({ nft }, "Adding item to cart");

        const new_cart_map = create(shopping_cart_map, (draft) => {
          draft.set(combineNftandCollectionID(nft.identifier, nft.collection), {
            collection: nft.collection,
            nft_id: nft.identifier,
            user_id,
            image_url: nft.image_url || undefined,
          });
        });
        const new_cart = Array.from(new_cart_map.values());

        updateCart({
          cart: new_cart,
          user_id,
        });
      },
      [shopping_cart_map, updateCart, user_id]
    );

    const image_components = React.useMemo(() => {
      return (
        Array.from(opensea_results_map.values()).map((nft) => {
          return (
            <ImageComponent
              key={reduceNftToID(nft)}
              nft={nft}
              in_cart={shopping_cart_map.has(
                combineNftandCollectionID(nft.identifier, nft.collection)
              )}
              onNftCardClick={onNftCardClick}
              onRemoveNft={onRemoveNft}
            />
          );
        }) ?? []
      );
    }, [opensea_results_map, shopping_cart_map, onNftCardClick, onRemoveNft]);

    return (
      <>
        <ShoppingCart
          shopping_chart={shopping_cart_map}
          onDelete={onRemoveCartItem}
        />
        <div className={styles.root}>
          <div className={styles.content}>
            <Typography>The NFT Shop</Typography>
            <Paper elevation={1} className={styles.paper}>
              <Unstable_Grid2
                container
                spacing={2}
                className={styles.grid_container}
              >
                {image_components}
              </Unstable_Grid2>
            </Paper>

            <LoadingButton
              variant="contained"
              color="primary"
              onClick={() => onRefresh()}
              loading={is_refetching}
            >
              Refresh
            </LoadingButton>
          </div>
          {selected_nft && (
            <NftDetailModal
              open={!!selected_nft}
              selected_nft={selected_nft}
              onClose={() => setSelectedNft(undefined)}
              onNftSave={addNftToCart}
            />
          )}
        </div>
      </>
    );
  },
  {
    Error: ({ error, retry }) => {
      logger.fatal({ error }, "Error loading page");
      return (
        <Backdrop open>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => retry()}>
                Retry
              </Button>
            }
          >
            There was an error loading the page
          </Alert>
        </Backdrop>
      );
    },
    Loading: () => {
      return (
        <Backdrop open>
          <CircularProgress />
        </Backdrop>
      );
    },
  }
);
